// Proves that one draft generation makes at most MAX_LLM_ATTEMPTS model calls, whatever the model returns.
// The model is a fake passed into runWithValidation. No OpenAI call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { GenerationError, MAX_LLM_ATTEMPTS, runWithValidation, type ModelCall } from '../lib/harness/write'
import type { GeneratedEmail } from '../lib/types/applications'

const GOOD: GeneratedEmail = { subject: 's', body: 'b', citations: [], skills_referenced: [] }
const BAD: GeneratedEmail = { subject: 'bad', body: 'bad', citations: [], skills_referenced: [] }

type Outcome = 'good' | 'bad' | 'throw'

// A model that follows a script. Once the script runs out, it keeps returning bad output, so a loop would show up as too many calls.
function scriptedModel(script: Outcome[]) {
    const inputs: string[] = []
    let calls = 0
    const call: ModelCall = async (params) => {
        calls++
        inputs.push(params.input)
        const outcome = script[calls - 1] ?? 'bad'
        if (outcome === 'throw') throw new Error('model unavailable')
        return outcome === 'good' ? GOOD : BAD
    }
    return { call, calls: () => calls, inputs }
}

const validate = (email: GeneratedEmail) => (email.subject === 'bad' ? ['Subject is not grounded.'] : [])

const run = (call: ModelCall) =>
    runWithValidation({
        name: 'test_email',
        debug: { stage: 'application_email', jobId: 'job-1', evidenceCount: 1 },
        instructions: 'rules',
        basePrompt: '{"ROLE":"Engineer"}',
        validate,
        call,
    })

test('the cap is two model calls', () => {
    assert.equal(MAX_LLM_ATTEMPTS, 2)
})

test('a valid first answer uses one call', async () => {
    const model = scriptedModel(['good'])
    const result = await run(model.call)
    assert.equal(result.attempts, 1)
    assert.equal(model.calls(), 1)
})

test('an invalid first answer is retried once, with the validator feedback in the retry', async () => {
    const model = scriptedModel(['bad', 'good'])
    const result = await run(model.call)
    assert.equal(result.attempts, 2)
    assert.equal(model.calls(), 2)
    assert.match(model.inputs[1], /failed these checks/)
    assert.match(model.inputs[1], /Subject is not grounded/)
})

test('two invalid answers stop the generation with a validation error, after exactly two calls', async () => {
    const model = scriptedModel(['bad', 'bad', 'good', 'good'])
    await assert.rejects(run(model.call), (error: unknown) => {
        assert.ok(error instanceof GenerationError)
        assert.equal(error.code, 'VALIDATION_FAILED')
        assert.equal(error.attempts, MAX_LLM_ATTEMPTS)
        assert.match(error.message, /could not be verified/)
        return true
    })
    assert.equal(model.calls(), MAX_LLM_ATTEMPTS, 'the model is not called a third time')
})

test('a model error on the first call is not retried inside the same generation', async () => {
    const model = scriptedModel(['throw', 'good'])
    await assert.rejects(run(model.call), /model unavailable/)
    assert.equal(model.calls(), 1)
})

test('a model error on the retry also stops the generation, with no third call', async () => {
    const model = scriptedModel(['bad', 'throw', 'good'])
    await assert.rejects(run(model.call), /model unavailable/)
    assert.equal(model.calls(), 2)
})

test('every possible sequence of outcomes makes at most two model calls', async () => {
    const outcomes: Outcome[] = ['good', 'bad', 'throw']
    // Five positions is more than the cap, so any loop that ignored the cap would show a count above two.
    for (const a of outcomes) for (const b of outcomes) for (const c of outcomes) for (const d of outcomes) for (const e of outcomes) {
        const model = scriptedModel([a, b, c, d, e])
        await run(model.call).catch(() => undefined)
        assert.ok(model.calls() <= MAX_LLM_ATTEMPTS, `script ${[a, b, c, d, e].join(',')} made ${model.calls()} calls`)
        assert.ok(model.calls() >= 1)
    }
})
