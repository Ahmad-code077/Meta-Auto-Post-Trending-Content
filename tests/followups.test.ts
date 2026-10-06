// Scheduler tests. They run the real state machine (lib/followups/scheduler.ts) against an in-memory store that
// follows the same rules as the conditional UPDATEs in lib/followups/store.ts. Generation and SMTP are fakes.
// No OpenAI or SMTP call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { runFollowUpScheduler, type FollowUpRow, type FollowUpStore, type GeneratedFollowUp, type SchedulerDeps } from '../lib/followups/scheduler'
import { classifyFailure, isDue, isStaleClaim, nextAttemptAt, PermanentFollowUpError, awaitingReply, MAX_ATTEMPTS, followUpDueAt, type FailureDecision } from '../lib/followups/policy'
import { setLogSink, type LogLevel } from '../lib/log/logger'
import type { Job } from '../lib/types/jobs'

// Keep test output readable. captureLogs() still records lines when a test needs them.
setLogSink(() => {})

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface StoredRow extends FollowUpRow {
    status: string
    sent_at?: string
    message_id?: string | null
    error?: string | null
    error_code?: string | null
    generation?: unknown
}

class MemoryStore implements FollowUpStore {
    readonly rows = new Map<string, StoredRow>()
    readonly jobs = new Map<string, Job>()

    constructor(rows: StoredRow[], jobs: Job[]) {
        for (const r of rows) this.rows.set(r.id, { ...r })
        for (const j of jobs) this.jobs.set(j.id, j)
    }

    get(id: string): StoredRow {
        const row = this.rows.get(id)
        if (!row) throw new Error(`no row ${id}`)
        return row
    }

    async listDue(now: Date, limit: number): Promise<FollowUpRow[]> {
        return [...this.rows.values()]
            .filter((r) => isDue(r, now))
            .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))
            .slice(0, limit)
            .map((r) => ({ ...r }))
    }

    async listStale(now: Date, limit: number): Promise<FollowUpRow[]> {
        return [...this.rows.values()].filter((r) => isStaleClaim(r as never, now)).slice(0, limit).map((r) => ({ ...r }))
    }

    // Synchronous body, so the check and the write cannot interleave. This mirrors one conditional UPDATE.
    async claim(row: FollowUpRow, token: string, now: Date): Promise<FollowUpRow | null> {
        const r = this.rows.get(row.id)
        if (!r || r.status !== 'scheduled' || r.attempts !== row.attempts || !isDue(r, now)) return null
        r.status = 'processing'
        r.claim_token = token
        r.claimed_at = now.toISOString()
        r.attempts += 1
        return { ...r }
    }

    async getJob(row: FollowUpRow): Promise<Job | null> {
        return this.jobs.get(row.job_id) ?? null
    }

    // Writes succeed only while the claim is still held, like the fenced UPDATEs in the real store.
    private fence(id: string, token: string, patch: Partial<StoredRow>): boolean {
        const r = this.rows.get(id)
        if (!r || r.status !== 'processing' || r.claim_token !== token) return false
        Object.assign(r, patch)
        return true
    }

    async saveContent(row: FollowUpRow, token: string, content: GeneratedFollowUp) {
        return this.fence(row.id, token, { subject: content.subject, body: content.body, generation: content.generation })
    }

    async markSent(row: FollowUpRow, token: string, messageId: string, sentAt: Date) {
        return this.fence(row.id, token, {
            status: 'sent', sent_at: sentAt.toISOString(), message_id: messageId, due_at: null, claim_token: null, claimed_at: null, error: null, error_code: null,
        })
    }

    async release(row: FollowUpRow, token: string, dueAt: Date, failure: FailureDecision) {
        return this.fence(row.id, token, {
            status: 'scheduled', due_at: dueAt.toISOString(), claim_token: null, claimed_at: null, error: failure.message, error_code: failure.code,
        })
    }

    async fail(row: FollowUpRow, token: string, failure: FailureDecision) {
        return this.fence(row.id, token, { status: 'failed', due_at: null, claim_token: null, error: failure.message, error_code: failure.code })
    }

    async cancel(row: FollowUpRow, token: string, code: string, message: string) {
        return this.fence(row.id, token, { status: 'cancelled', due_at: null, claim_token: null, error: message, error_code: code })
    }

    async failStale(row: FollowUpRow) {
        const r = this.rows.get(row.id)
        if (!r || r.status !== 'processing' || r.claim_token !== row.claim_token) return false
        Object.assign(r, { status: 'failed', claim_token: null, error_code: 'STALE_CLAIM' })
        return true
    }
}

function row(overrides: Partial<StoredRow> = {}): StoredRow {
    return {
        id: 'fu-1',
        user_id: 'user-1',
        job_id: 'job-1',
        follow_up_number: 1,
        status: 'scheduled',
        due_at: '2026-10-06T09:00:00.000Z',
        attempts: 0,
        to_email: 'recruiter@example.com',
        in_reply_to: '<orig@example.com>',
        references_header: null,
        subject: null,
        body: null,
        claim_token: null,
        claimed_at: null,
        ...overrides,
    }
}

function job(overrides: Partial<Job> = {}): Job {
    return { id: 'job-1', user_id: 'user-1', status: 'sent', title: 'Backend Engineer', company: 'Globex', ...overrides } as Job
}

class Clock {
    constructor(public current: Date) {}
    now = () => new Date(this.current.getTime())
    advance(minutes: number) {
        this.current = new Date(this.current.getTime() + minutes * 60_000)
    }
}

interface FakeOptions {
    generate?: () => Promise<GeneratedFollowUp>
    transmit?: () => Promise<string>
}

function fakeDeps(store: MemoryStore, clock: Clock, options: FakeOptions = {}) {
    const calls = { generate: 0, transmit: 0, afterSent: 0 }
    let tokens = 0
    const deps: SchedulerDeps = {
        store,
        now: clock.now,
        newToken: () => `token-${++tokens}`,
        async generate() {
            calls.generate++
            if (options.generate) return options.generate()
            return { subject: 'Following up', body: 'Following up on the Backend Engineer role at Globex.', generation: {} }
        },
        async transmit() {
            calls.transmit++
            if (options.transmit) return options.transmit()
            return `<sent-${calls.transmit}@example.com>`
        },
        async afterSent() {
            calls.afterSent++
        },
    }
    return { deps, calls }
}

function smtpError(code: string, message = 'smtp failure'): Error {
    return Object.assign(new Error(message), { code })
}

// Captures structured log lines so tests can check both the events and what must never appear.
function captureLogs(): { lines: { level: LogLevel; record: Record<string, unknown>; raw: string }[]; restore: () => void } {
    const lines: { level: LogLevel; record: Record<string, unknown>; raw: string }[] = []
    setLogSink((level, raw) => lines.push({ level, record: JSON.parse(raw), raw }))
    return { lines, restore: () => setLogSink(null) }
}

const T0 = new Date('2026-10-13T09:00:00.000Z')

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

test('policy: a transient SMTP connection error is retried, an ambiguous one is not', () => {
    assert.equal(classifyFailure(smtpError('ECONNECTION'), 'transmit').retry, true)
    assert.equal(classifyFailure(smtpError('EDNS'), 'transmit').retry, true)
    // A timeout can happen after the message body was accepted, so it must not be retried automatically.
    assert.equal(classifyFailure(smtpError('ETIMEDOUT'), 'transmit').retry, false)
    assert.equal(classifyFailure(smtpError('EAUTH'), 'transmit').retry, false)
    assert.equal(classifyFailure(smtpError('EENVELOPE'), 'transmit').retry, false)
})

test('policy: generation failures are retryable, permanent errors never are', () => {
    assert.equal(classifyFailure(new Error('model timeout'), 'generate').retry, true)
    assert.equal(classifyFailure(new PermanentFollowUpError('NO_PREVIOUS_SENT', 'none'), 'generate').retry, false)
})

test('policy: retries wait 15, then 60 minutes, then stop after the third attempt', () => {
    const now = new Date(T0)
    assert.equal(nextAttemptAt(1, now)!.getTime() - now.getTime(), 15 * 60_000)
    assert.equal(nextAttemptAt(2, now)!.getTime() - now.getTime(), 60 * 60_000)
    assert.equal(nextAttemptAt(MAX_ATTEMPTS, now), null)
})

test('policy: a follow-up is due only when scheduled and its time has come', () => {
    assert.equal(isDue({ status: 'scheduled', due_at: '2026-10-13T08:59:59.000Z' }, T0), true)
    assert.equal(isDue({ status: 'scheduled', due_at: '2026-10-13T09:00:01.000Z' }, T0), false)
    assert.equal(isDue({ status: 'processing', due_at: '2026-10-13T08:00:00.000Z' }, T0), false)
    assert.equal(isDue({ status: 'scheduled', due_at: null }, T0), false)
})

test('policy: a claim older than the stale window is stale', () => {
    assert.equal(isStaleClaim({ status: 'processing', claimed_at: '2026-10-13T08:30:00.000Z' }, T0), true)
    assert.equal(isStaleClaim({ status: 'processing', claimed_at: '2026-10-13T08:50:00.000Z' }, T0), false)
})

test('policy: follow-up 1 waits for "sent", follow-up 2 waits for "follow_up_1"', () => {
    assert.equal(awaitingReply('sent', 1), true)
    assert.equal(awaitingReply('replied', 1), false)
    assert.equal(awaitingReply('follow_up_1', 2), true)
    assert.equal(awaitingReply('sent', 2), false)
    assert.equal(followUpDueAt(T0).getTime() - T0.getTime(), 7 * 86_400_000)
})

// ---------------------------------------------------------------------------
// Due selection and atomic claiming
// ---------------------------------------------------------------------------

test('only due, scheduled follow-ups are selected', async () => {
    const store = new MemoryStore([
        row({ id: 'due' }),
        row({ id: 'later', due_at: '2026-10-20T09:00:00.000Z' }),
        row({ id: 'done', status: 'sent' }),
    ], [job()])
    const due = await store.listDue(T0, 10)
    assert.deepEqual(due.map((r) => r.id), ['due'])
})

test('two workers that read the same due row cannot both claim it', async () => {
    const store = new MemoryStore([row()], [job()])
    const [snapshot] = await store.listDue(T0, 10)

    const first = await store.claim(snapshot, 'worker-a', T0)
    const second = await store.claim(snapshot, 'worker-b', T0)

    assert.ok(first, 'first worker claims the row')
    assert.equal(second, null, 'second worker gets nothing')
    assert.equal(store.get('fu-1').claim_token, 'worker-a')
})

test('a claim is refused when the attempt count it read is out of date', async () => {
    const store = new MemoryStore([row({ attempts: 1 })], [job()])
    const stale = { ...row({ attempts: 0 }) }
    assert.equal(await store.claim(stale, 'late-worker', T0), null)
})

test('a stale worker cannot write over a claim that now belongs to someone else', async () => {
    const store = new MemoryStore([row()], [job()])
    await store.claim(row(), 'worker-a', T0)
    assert.equal(await store.markSent(row(), 'worker-b', '<x@y>', T0), false)
    assert.equal(store.get('fu-1').status, 'processing')
})

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

test('scheduled -> processing -> sent on a successful send, with the attempt recorded', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)

    const summary = await runFollowUpScheduler(deps)

    const r = store.get('fu-1')
    assert.equal(r.status, 'sent')
    assert.equal(r.attempts, 1)
    assert.equal(r.message_id, '<sent-1@example.com>')
    assert.equal(r.claim_token, null)
    assert.equal(calls.transmit, 1)
    assert.equal(calls.afterSent, 1)
    assert.equal(summary.sent, 1)
})

test('the follow-up is not marked sent when SMTP fails', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps } = fakeDeps(store, clock, { transmit: async () => { throw smtpError('EAUTH', 'auth rejected') } })

    await runFollowUpScheduler(deps)

    assert.notEqual(store.get('fu-1').status, 'sent')
})

test('a transient connection failure is rescheduled for 15 minutes later, then sends on the next run', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    let failNext = true
    const { deps, calls } = fakeDeps(store, clock, {
        transmit: async () => {
            if (failNext) { failNext = false; throw smtpError('ECONNECTION') }
            return '<retry-ok@example.com>'
        },
    })

    const first = await runFollowUpScheduler(deps)
    const afterFailure = store.get('fu-1')
    assert.equal(afterFailure.status, 'scheduled')
    assert.equal(afterFailure.attempts, 1)
    assert.equal(afterFailure.error_code, 'ECONNECTION')
    assert.equal(Date.parse(afterFailure.due_at!) - T0.getTime(), 15 * 60_000)
    assert.equal(first.retry_scheduled, 1)

    // Too early: nothing is due.
    clock.advance(10)
    assert.equal((await runFollowUpScheduler(deps)).due, 0)

    clock.advance(10)
    const second = await runFollowUpScheduler(deps)
    assert.equal(second.sent, 1)
    assert.equal(store.get('fu-1').status, 'sent')
    assert.equal(store.get('fu-1').attempts, 2)
    assert.equal(calls.transmit, 2)
})

test('a permanent SMTP rejection fails at once, with no retry', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock, { transmit: async () => { throw smtpError('EENVELOPE', 'recipient rejected') } })

    const summary = await runFollowUpScheduler(deps)

    assert.equal(store.get('fu-1').status, 'failed')
    assert.equal(store.get('fu-1').attempts, 1)
    assert.equal(summary.failed, 1)
    assert.equal(calls.transmit, 1)
})

test('an ambiguous SMTP timeout is failed, not retried, so the email cannot be sent twice automatically', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock, { transmit: async () => { throw smtpError('ETIMEDOUT') } })

    await runFollowUpScheduler(deps)
    clock.advance(24 * 60)
    await runFollowUpScheduler(deps)

    assert.equal(store.get('fu-1').status, 'failed')
    assert.equal(calls.transmit, 1)
})

test('generation failures retry until the attempt limit, then fail', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock, { generate: async () => { throw new Error('model unavailable') } })

    await runFollowUpScheduler(deps)
    clock.advance(15)
    await runFollowUpScheduler(deps)
    clock.advance(60)
    const last = await runFollowUpScheduler(deps)

    const r = store.get('fu-1')
    assert.equal(r.status, 'failed')
    assert.equal(r.attempts, MAX_ATTEMPTS)
    assert.equal(last.failed, 1)
    assert.equal(calls.transmit, 0, 'nothing is sent when generation fails')
})

test('a follow-up with no earlier sent email fails without retrying', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps } = fakeDeps(store, clock, { generate: async () => { throw new PermanentFollowUpError('NO_PREVIOUS_SENT', 'none') } })

    await runFollowUpScheduler(deps)

    assert.equal(store.get('fu-1').status, 'failed')
    assert.equal(store.get('fu-1').attempts, 1)
})

test('a follow-up for a job that has been replied to is cancelled and never sent', async () => {
    const store = new MemoryStore([row()], [job({ status: 'replied' })])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)

    const summary = await runFollowUpScheduler(deps)

    assert.equal(store.get('fu-1').status, 'cancelled')
    assert.equal(store.get('fu-1').error_code, 'JOB_NOT_AWAITING_REPLY')
    assert.equal(calls.transmit, 0)
    assert.equal(summary.cancelled, 1)
})

test('a processing row whose worker stopped is failed as stale and never resent', async () => {
    const stale = row({ status: 'processing', claim_token: 'dead-worker', claimed_at: '2026-10-13T08:00:00.000Z', attempts: 1 })
    const store = new MemoryStore([stale], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)

    const summary = await runFollowUpScheduler(deps)

    assert.equal(store.get('fu-1').status, 'failed')
    assert.equal(store.get('fu-1').error_code, 'STALE_CLAIM')
    assert.equal(summary.stale_recovered, 1)
    assert.equal(calls.transmit, 0)
})

// ---------------------------------------------------------------------------
// Idempotency and concurrency
// ---------------------------------------------------------------------------

test('two scheduler runs at the same time send a due follow-up exactly once', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)
    // Give the transport an await point, so the two runs interleave.
    const slowTransmit = deps.transmit
    deps.transmit = async (r) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return slowTransmit(r)
    }

    const [a, b] = await Promise.all([runFollowUpScheduler(deps), runFollowUpScheduler(deps)])

    assert.equal(calls.transmit, 1, 'SMTP was called once')
    assert.equal(store.get('fu-1').status, 'sent')
    assert.equal(a.sent + b.sent, 1)
})

test('running the scheduler again after a success does not send again', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)

    await runFollowUpScheduler(deps)
    clock.advance(24 * 60)
    const again = await runFollowUpScheduler(deps)

    assert.equal(calls.transmit, 1)
    assert.equal(again.due, 0)
})

test('if recording "sent" fails after SMTP accepted the message, the row is not sent again', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps, calls } = fakeDeps(store, clock)
    store.markSent = async () => false

    await runFollowUpScheduler(deps)

    // Within the stale window the row stays claimed, and nothing else touches it.
    clock.advance(1)
    await runFollowUpScheduler(deps)
    assert.equal(store.get('fu-1').status, 'processing')

    // After the window it is failed, never resent. The Message-ID was sent once and the log names it.
    clock.advance(24 * 60)
    await runFollowUpScheduler(deps)
    assert.equal(store.get('fu-1').status, 'failed')
    assert.equal(store.get('fu-1').error_code, 'STALE_CLAIM')
    assert.equal(calls.transmit, 1)
})

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

test('the scheduler logs each step with ids, and never logs message content or credentials', async () => {
    const SECRET = 'smtp-pass-do-not-log'
    process.env.SMTP_PASS = SECRET
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps } = fakeDeps(store, clock, {
        generate: async () => ({ subject: 'Subject line with private words', body: 'Body text with private words', generation: {} }),
    })
    const logs = captureLogs()
    try {
        await runFollowUpScheduler(deps)
    } finally {
        logs.restore()
        delete process.env.SMTP_PASS
    }

    const events = logs.lines.map((l) => l.record.event)
    for (const expected of ['followup.scheduler.start', 'followup.discovered', 'followup.claimed', 'followup.generation.start', 'followup.generation.success', 'followup.send.start', 'followup.send.success', 'followup.sent', 'followup.scheduler.end']) {
        assert.ok(events.includes(expected), `missing event ${expected}`)
    }

    const claimed = logs.lines.find((l) => l.record.event === 'followup.claimed')!
    assert.equal(claimed.record.follow_up_id, 'fu-1')
    assert.equal(claimed.record.job_id, 'job-1')
    assert.equal(claimed.record.attempt, 1)
    assert.ok(typeof logs.lines[0].record.ts === 'string')

    const everything = logs.lines.map((l) => l.raw).join('\n')
    assert.ok(!everything.includes(SECRET), 'SMTP password must never be logged')
    assert.ok(!everything.includes('private words'), 'email content must never be logged')
    assert.ok(!everything.includes('recruiter@example.com'), 'recipient address must never be logged')
})

test('failed attempts are logged at warn or error with the error code', async () => {
    const store = new MemoryStore([row()], [job()])
    const clock = new Clock(T0)
    const { deps } = fakeDeps(store, clock, { transmit: async () => { throw smtpError('ECONNECTION', 'refused at host smtp.example.com') } })
    const logs = captureLogs()
    try {
        await runFollowUpScheduler(deps)
    } finally {
        logs.restore()
    }

    const send = logs.lines.find((l) => l.record.event === 'followup.send.failed')!
    assert.equal(send.level, 'error')
    assert.equal(send.record.error_code, 'ECONNECTION')
    const retry = logs.lines.find((l) => l.record.event === 'followup.retry_scheduled')!
    assert.equal(retry.level, 'warn')
    assert.equal(retry.record.attempt, 1)
})
