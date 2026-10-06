// Logger redaction and cron authentication. Pure functions, no environment or network access.

import test from 'node:test'
import assert from 'node:assert/strict'
import { errorFields, sanitizeFields, scrub, setLogSink } from '../lib/log/logger'
import { isAuthorizedCronRequest } from '../lib/auth/cron'

// Keep test output readable. captureLogs() still records lines when a test needs them.
setLogSink(() => {})

test('logger drops keys that can carry credentials or message content', () => {
    const clean = sanitizeFields({
        smtp_pass: 'x', SMTP_PASS: 'x', openai_api_key: 'x', CRON_SECRET: 'x', authorization: 'x',
        access_token: 'x', claim_token: 'x', body: 'x', subject: 'x', resume: 'x', to_email: 'x', recipient: 'x',
    })
    assert.deepEqual(clean, {})
})

test('logger keeps identifiers and operational fields', () => {
    const clean = sanitizeFields({ follow_up_id: 'a', job_id: 'b', user_id: 'c', attempt: 2, error_code: 'ECONNECTION', duration_ms: 12, status: 'sent' })
    assert.deepEqual(clean, { follow_up_id: 'a', job_id: 'b', user_id: 'c', attempt: 2, error_code: 'ECONNECTION', duration_ms: 12, status: 'sent' })
})

test('free text is scrubbed of email addresses and bearer credentials, and capped', () => {
    assert.equal(scrub('rejected user@example.com'), 'rejected [email]')
    assert.equal(scrub('Authorization Bearer abc123xyz'), 'Authorization Bearer [redacted]')
    assert.ok(scrub('x'.repeat(1000)).length <= 243)
})

test('error fields carry the code and a scrubbed message, never a stack', () => {
    const error = Object.assign(new Error('failed for person@example.com'), { code: 'EAUTH' })
    const fields = errorFields(error)
    assert.equal(fields.error_code, 'EAUTH')
    assert.equal(fields.error_message, 'failed for [email]')
    assert.ok(!JSON.stringify(fields).includes('at '), 'no stack trace')
})

test('cron requests are authorized only with the exact bearer secret', () => {
    const secret = 'correct-horse-battery-staple'
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true)
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}x`, secret), false)
    assert.equal(isAuthorizedCronRequest(`Bearer wrong`, secret), false)
    assert.equal(isAuthorizedCronRequest(secret, secret), false, 'raw secret without the scheme is refused')
    assert.equal(isAuthorizedCronRequest(null, secret), false, 'missing header is refused')
})

test('an unset cron secret never authorizes, even for an empty header', () => {
    assert.equal(isAuthorizedCronRequest('Bearer ', undefined), false)
    assert.equal(isAuthorizedCronRequest('Bearer undefined', undefined), false)
    assert.equal(isAuthorizedCronRequest('Bearer ', ''), false)
})
