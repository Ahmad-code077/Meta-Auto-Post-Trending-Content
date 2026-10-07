// Gating and formatting of the LLM debug output. Pure functions, no model call.

import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTokens, formatOutputDebug, formatPromptDebug, promptDebugEnabled } from '../lib/harness/debug'

test('prompt debugging is off unless LLM_DEBUG_PROMPT is exactly "true"', () => {
    assert.equal(promptDebugEnabled({}), false)
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'false' }), false)
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'yes' }), false)
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'true' }), true)
})

test('prompt debugging is never on in production, even when the flag is set', () => {
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'true', NODE_ENV: 'production' }), false)
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'true', VERCEL_ENV: 'production' }), false)
    assert.equal(promptDebugEnabled({ LLM_DEBUG_PROMPT: 'true', VERCEL_ENV: 'preview' }), true)
})

test('the input block shows the model, job, evidence count, sizes and the exact system and user text', () => {
    const text = formatPromptDebug({
        model: 'gpt-4.1',
        context: { stage: 'application_email', jobId: 'job-1', evidenceCount: 3, attempt: 2 },
        system: 'SYSTEM RULES',
        user: '{"ROLE":"Backend Engineer"}',
    })
    assert.match(text, /^\[LLM DEBUG\] stage=application_email attempt=2/)
    assert.match(text, /model=gpt-4\.1/)
    assert.match(text, /job_id=job-1/)
    assert.match(text, /evidence_count=3/)
    assert.match(text, /prompt_tokens_estimate=\d+/)
    assert.ok(text.includes('--- SYSTEM ---\nSYSTEM RULES\n--- USER ---\n{"ROLE":"Backend Engineer"}\n--- END LLM INPUT ---'))
})

test('the output block shows the raw output and the exact token counts from OpenAI', () => {
    const text = formatOutputDebug({
        context: { stage: 'follow_up_email', jobId: 'job-1' },
        output: '{"subject":"Following up"}',
        inputTokens: 812,
        outputTokens: 96,
    })
    assert.match(text, /prompt_tokens=812/)
    assert.match(text, /output_tokens=96/)
    assert.ok(text.includes('--- OUTPUT ---\n{"subject":"Following up"}\n--- END LLM OUTPUT ---'))
})

test('missing usage is reported as unknown rather than zero', () => {
    const text = formatOutputDebug({ context: { stage: 'analysis' }, output: '{}' })
    assert.match(text, /prompt_tokens=unknown/)
})

test('the token estimate is about one token per four characters', () => {
    assert.equal(estimateTokens('abcd'), 1)
    assert.equal(estimateTokens('abcde'), 2)
    assert.equal(estimateTokens(''), 0)
})
