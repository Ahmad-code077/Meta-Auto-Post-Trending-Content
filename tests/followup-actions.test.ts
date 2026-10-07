// Tests for user actions on follow-ups (lib/followups/manage.ts). They run the same decision and update code
// the server actions use, against an in-memory store that applies conditional updates like the database.
// No OpenAI, SMTP or Supabase call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
    applyFollowUpAction,
    decideFollowUpAction,
    DuplicateFollowUpError,
    isSafeToRetry,
    type ManagedFollowUp,
    type ManagedJob,
    type ManageStore,
} from '../lib/followups/manage'
import { setLogSink } from '../lib/log/logger'
import { zonedTimeToUtc } from '../lib/followups/schedule'

setLogSink(() => {})

const NOW = new Date('2026-10-13T09:00:00.000Z')
// A valid send time: Tuesday 2026-10-20 at 10:00 in Karachi, inside the Tuesday-to-Thursday morning window.
const IN_TWO_DAYS = zonedTimeToUtc(2026, 10, 20, 10, 0, 'Asia/Karachi').toISOString()

interface StoredFollowUp extends ManagedFollowUp {
    user_id: string
    due_at: string | null
    error: string | null
}

class MemoryManage implements ManageStore {
    readonly rows = new Map<string, StoredFollowUp>()
    readonly jobs = new Map<string, ManagedJob>()
    updates = 0
    // Runs just before a conditional update, to simulate the scheduler claiming a row in between.
    beforeUpdate: ((id: string) => void) | null = null
    duplicateOnUpdate = false

    constructor(rows: StoredFollowUp[], jobs: ManagedJob[]) {
        for (const r of rows) this.rows.set(r.id, { ...r })
        for (const j of jobs) this.jobs.set(j.id, j)
    }

    async getFollowUp(id: string, userId: string) {
        const r = this.rows.get(id)
        return r && r.user_id === userId && r.kind === 'follow_up' ? { ...r } : null
    }

    async getJob(jobId: string, userId: string) {
        const j = this.jobs.get(jobId)
        return j && j.user_id === userId ? { ...j } : null
    }

    async updateIfStatus(id: string, userId: string, expectedStatus: string, patch: Record<string, unknown>) {
        this.beforeUpdate?.(id)
        if (this.duplicateOnUpdate) throw new DuplicateFollowUpError('one live follow-up per number')
        const r = this.rows.get(id)
        if (!r || r.user_id !== userId || r.status !== expectedStatus) return false
        Object.assign(r, patch)
        this.updates++
        return true
    }
}

const OWNER = 'user-owner'
const OTHER = 'user-other'

function followUp(overrides: Partial<StoredFollowUp> = {}): StoredFollowUp {
    return {
        id: 'fu-1',
        user_id: OWNER,
        job_id: 'job-1',
        kind: 'follow_up',
        follow_up_number: 1,
        status: 'scheduled',
        due_at: IN_TWO_DAYS,
        attempts: 0,
        error_code: null,
        error: null,
        ...overrides,
    }
}

function job(overrides: Partial<ManagedJob> = {}): ManagedJob {
    return { id: 'job-1', user_id: OWNER, status: 'sent', ...overrides }
}

function storeWith(rows: StoredFollowUp[], jobs: ManagedJob[] = [job()]) {
    return new MemoryManage(rows, jobs)
}

const cancel = (store: MemoryManage, userId = OWNER, followUpId = 'fu-1', jobId = 'job-1') =>
    applyFollowUpAction(store, { userId, jobId, followUpId, action: { kind: 'cancel' }, now: NOW })

const reschedule = (store: MemoryManage, dueAt: unknown, userId = OWNER, followUpId = 'fu-1', jobId = 'job-1') =>
    applyFollowUpAction(store, { userId, jobId, followUpId, action: { kind: 'reschedule', dueAt }, now: NOW })

const retry = (store: MemoryManage, dueAt: unknown, userId = OWNER, followUpId = 'fu-1', jobId = 'job-1') =>
    applyFollowUpAction(store, { userId, jobId, followUpId, action: { kind: 'retry', dueAt }, now: NOW })

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

test("another user's follow-up is reported as not found, and nothing is changed", async () => {
    const store = storeWith([followUp()], [job()])
    const result = await cancel(store, OTHER)
    assert.deepEqual(result, { ok: false, code: 'NOT_FOUND', message: 'Follow-up not found.' })
    assert.equal(store.updates, 0)
    assert.equal(store.rows.get('fu-1')!.status, 'scheduled')
})

test('a missing follow-up gives the same answer as someone else\'s, so ids cannot be probed', async () => {
    const store = storeWith([followUp()])
    const missing = await cancel(store, OWNER, 'no-such-id')
    const foreign = await cancel(storeWith([followUp()]), OTHER)
    assert.deepEqual(missing, foreign)
})

test('a follow-up from a different application cannot be changed through this one', async () => {
    const store = storeWith([followUp({ job_id: 'job-2' })], [job({ id: 'job-1' }), job({ id: 'job-2' })])
    const result = await reschedule(store, IN_TWO_DAYS, OWNER, 'fu-1', 'job-1')
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, 'NOT_FOUND')
    assert.equal(store.updates, 0)
})

test('an application owned by someone else is not found, even for the follow-up\'s own user', async () => {
    const store = storeWith([followUp({ user_id: OWNER })], [job({ user_id: OTHER })])
    const result = await cancel(store, OWNER)
    assert.equal((result as { code: string }).code, 'NOT_FOUND')
    assert.equal(store.updates, 0)
})

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

test('a scheduled follow-up can be cancelled, and the server reports the new state', async () => {
    const store = storeWith([followUp()])
    const result = await cancel(store)
    assert.equal(result.ok, true)
    assert.equal((result as { status: string }).status, 'cancelled')
    const row = store.rows.get('fu-1')!
    assert.equal(row.status, 'cancelled')
    assert.equal(row.due_at, null)
    assert.equal(row.error_code, 'CANCELLED_BY_USER')
})

test('cancel is refused for every status other than scheduled', () => {
    for (const status of ['processing', 'sent', 'failed', 'cancelled']) {
        const decision = decideFollowUpAction(followUp({ status }), job(), { kind: 'cancel' }, NOW)
        assert.equal(decision.ok, false, `cancel must be refused for ${status}`)
    }
})

test('a processing follow-up cannot be cancelled, even when the request races the scheduler', async () => {
    const store = storeWith([followUp()])
    // The scheduler claims the row between the read and the write.
    store.beforeUpdate = (id) => {
        const r = store.rows.get(id)!
        r.status = 'processing'
        r.attempts = 1
    }
    const result = await cancel(store)
    assert.equal(result.ok, false)
    assert.equal((result as { code: string }).code, 'CONFLICT')
    assert.equal(store.rows.get('fu-1')!.status, 'processing', 'the claim is not overwritten')
    assert.equal(store.updates, 0)
})

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

test('a scheduled follow-up can be moved, and the same row is updated (no duplicate created)', async () => {
    const store = storeWith([followUp()])
    const newTime = zonedTimeToUtc(2026, 10, 21, 10, 0, 'Asia/Karachi').toISOString() // Wednesday 10:00 Karachi
    const result = await reschedule(store, newTime)
    assert.equal(result.ok, true)
    assert.equal(store.rows.size, 1, 'still one row')
    assert.equal(store.rows.get('fu-1')!.due_at, newTime)
    assert.equal(store.rows.get('fu-1')!.status, 'scheduled')
})

test('reschedule rejects values that are not valid times', async () => {
    for (const value of ['not a date', '', null, undefined, 42]) {
        const store = storeWith([followUp()])
        const result = await reschedule(store, value)
        assert.equal((result as { code: string }).code, 'INVALID_TIME', `rejected ${String(value)}`)
        assert.equal(store.updates, 0)
    }
})

test('reschedule rejects times in the past, under a minute away, or more than a year away', () => {
    const cases: [string, string][] = [
        [new Date(NOW.getTime() - 3_600_000).toISOString(), 'past'],
        [new Date(NOW.getTime() + 30_000).toISOString(), 'too soon'],
        [new Date(NOW.getTime() + 400 * 86_400_000).toISOString(), 'too far'],
    ]
    for (const [value, label] of cases) {
        const decision = decideFollowUpAction(followUp(), job(), { kind: 'reschedule', dueAt: value }, NOW)
        assert.equal(decision.ok, false, label)
    }
})

test('reschedule is refused for sent, processing, failed and cancelled follow-ups', () => {
    for (const status of ['processing', 'sent', 'failed', 'cancelled']) {
        const decision = decideFollowUpAction(followUp({ status }), job(), { kind: 'reschedule', dueAt: IN_TWO_DAYS }, NOW)
        assert.equal(decision.ok, false, `reschedule must be refused for ${status}`)
    }
})

test('reschedule is refused when the job has been replied to, so a cancelled path cannot be revived', () => {
    const decision = decideFollowUpAction(followUp(), job({ status: 'replied' }), { kind: 'reschedule', dueAt: IN_TWO_DAYS }, NOW)
    assert.equal(decision.ok, false)
})

test('a second live follow-up for the same application is refused by the database guard and reported as a conflict', async () => {
    const store = storeWith([followUp()])
    store.duplicateOnUpdate = true
    const result = await reschedule(store, IN_TWO_DAYS)
    assert.equal((result as { code: string }).code, 'CONFLICT')
    assert.match((result as { message: string }).message, /already scheduled/)
})

test('follow-up 2 is moved when the job is in follow_up_1, and not when it is still sent', () => {
    const later = followUp({ id: 'fu-2', follow_up_number: 2 })
    assert.equal(decideFollowUpAction(later, job({ status: 'follow_up_1' }), { kind: 'reschedule', dueAt: IN_TWO_DAYS }, NOW).ok, true)
    assert.equal(decideFollowUpAction(later, job({ status: 'sent' }), { kind: 'reschedule', dueAt: IN_TWO_DAYS }, NOW).ok, false)
})

// ---------------------------------------------------------------------------
// Failed: retry
// ---------------------------------------------------------------------------

test('a failed follow-up with a safe error can be retried at a chosen time, keeping its attempt count', async () => {
    const store = storeWith([followUp({ status: 'failed', attempts: 2, error_code: 'ECONNECTION', error: 'refused' })])
    const result = await retry(store, IN_TWO_DAYS)
    assert.equal(result.ok, true)
    const row = store.rows.get('fu-1')!
    assert.equal(row.status, 'scheduled')
    assert.equal(row.due_at, IN_TWO_DAYS)
    assert.equal(row.attempts, 2, 'history is kept')
    assert.equal(row.error_code, null)
})

test('retry is refused for failures where the email may already have been delivered', async () => {
    for (const code of ['ETIMEDOUT', 'ESOCKET', 'STALE_CLAIM', 'SMTP_FAILED', null]) {
        const store = storeWith([followUp({ status: 'failed', error_code: code })])
        const result = await retry(store, IN_TWO_DAYS)
        assert.equal(result.ok, false, `retry must be refused for ${String(code)}`)
        assert.match((result as { message: string }).message, /sent folder/)
        assert.equal(store.updates, 0)
    }
})

test('retry is refused when the recipient was rejected or there was no earlier email', () => {
    for (const code of ['EENVELOPE', 'NO_PREVIOUS_SENT']) {
        const decision = decideFollowUpAction(followUp({ status: 'failed', error_code: code }), job(), { kind: 'retry', dueAt: IN_TWO_DAYS }, NOW)
        assert.equal(decision.ok, false, code)
    }
})

test('retry is refused for every status other than failed', () => {
    for (const status of ['scheduled', 'processing', 'sent', 'cancelled']) {
        const decision = decideFollowUpAction(followUp({ status, error_code: 'ECONNECTION' }), job(), { kind: 'retry', dueAt: IN_TWO_DAYS }, NOW)
        assert.equal(decision.ok, false, `retry must be refused for ${status}`)
    }
})

test('retry is refused once the job no longer awaits a reply', () => {
    const decision = decideFollowUpAction(followUp({ status: 'failed', error_code: 'ECONNECTION' }), job({ status: 'replied' }), { kind: 'retry', dueAt: IN_TWO_DAYS }, NOW)
    assert.equal(decision.ok, false)
})

test('retry validates the new time like reschedule does', async () => {
    const store = storeWith([followUp({ status: 'failed', error_code: 'EAUTH' })])
    const result = await retry(store, new Date(NOW.getTime() - 60_000).toISOString())
    assert.equal((result as { code: string }).code, 'INVALID_TIME')
    assert.equal(store.updates, 0)
})

test('a failed retry does not leave the follow-up half changed', async () => {
    const store = storeWith([followUp({ status: 'failed', error_code: 'ECONNECTION' })])
    store.beforeUpdate = (id) => {
        // The row was changed by someone else between the read and the write.
        store.rows.get(id)!.status = 'cancelled'
    }
    const result = await retry(store, IN_TWO_DAYS)
    assert.equal((result as { code: string }).code, 'CONFLICT')
    assert.equal(store.rows.get('fu-1')!.status, 'cancelled')
})

// ---------------------------------------------------------------------------
// Sent follow-ups are final
// ---------------------------------------------------------------------------

test('a sent follow-up cannot be cancelled, moved or retried', async () => {
    const sent = followUp({ status: 'sent' })
    for (const action of [
        { kind: 'cancel' as const },
        { kind: 'reschedule' as const, dueAt: IN_TWO_DAYS },
        { kind: 'retry' as const, dueAt: IN_TWO_DAYS },
    ]) {
        const decision = decideFollowUpAction(sent, job(), action, NOW)
        assert.equal(decision.ok, false, action.kind)
    }
    const store = storeWith([sent])
    await cancel(store)
    assert.equal(store.rows.get('fu-1')!.status, 'sent')
    assert.equal(store.updates, 0)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('isSafeToRetry allows only failures where nothing reached the recipient', () => {
    for (const code of ['GENERATION_FAILED', 'ECONNECTION', 'EDNS', 'EAUTH']) assert.equal(isSafeToRetry(code), true, code)
    for (const code of ['ETIMEDOUT', 'ESOCKET', 'STALE_CLAIM', 'SMTP_FAILED', 'EENVELOPE', 'NO_PREVIOUS_SENT', null]) {
        assert.equal(isSafeToRetry(code), false, String(code))
    }
})

test('a valid action on a scheduled follow-up returns the new status and due time', async () => {
    const store = storeWith([followUp()])
    const result = await reschedule(store, IN_TWO_DAYS)
    assert.deepEqual(result, { ok: true, status: 'scheduled', dueAt: IN_TWO_DAYS })
})
