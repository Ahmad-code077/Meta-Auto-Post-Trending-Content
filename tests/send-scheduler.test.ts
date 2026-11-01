// Tests for the scheduled-application-send processor (lib/mail/send-scheduler.ts) against an
// in-memory store. No Supabase call, no SMTP call -- store.send() is a fake that records calls.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
    runScheduledApplicationSends,
    type DueApplicationSend,
    type SendSchedulerDeps,
    type SendSchedulerStore,
} from '../lib/mail/send-scheduler'
import { setLogSink } from '../lib/log/logger'

setLogSink(() => {})

interface StoredRow extends DueApplicationSend {
    status: 'scheduled' | 'sent' | 'cancelled'
}

class MemoryStore implements SendSchedulerStore {
    readonly rows = new Map<string, StoredRow>()
    readonly sent: string[] = []
    sendError: Error | null = null

    constructor(rows: StoredRow[]) {
        for (const r of rows) this.rows.set(r.id, { ...r })
    }

    async listDue(now: Date, limit: number): Promise<DueApplicationSend[]> {
        return [...this.rows.values()]
            .filter((r) => r.status === 'scheduled' && Date.parse(r.due_at) <= now.getTime())
            .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
            .slice(0, limit)
            .map((r) => ({ id: r.id, user_id: r.user_id, due_at: r.due_at }))
    }

    async reschedule(id: string, dueAt: Date): Promise<boolean> {
        const r = this.rows.get(id)
        if (!r || r.status !== 'scheduled') return false
        r.due_at = dueAt.toISOString()
        return true
    }

    async send(userId: string, id: string): Promise<void> {
        if (this.sendError) throw this.sendError
        const r = this.rows.get(id)
        if (r) r.status = 'sent'
        this.sent.push(id)
    }
}

function row(overrides: Partial<StoredRow> = {}): StoredRow {
    return { id: 'app-1', user_id: 'user-1', due_at: '2026-10-06T09:00:00.000Z', status: 'scheduled', ...overrides }
}

class Clock {
    constructor(public current: Date) {}
    now = () => new Date(this.current.getTime())
}

function deps(store: MemoryStore, clock: Clock): SendSchedulerDeps {
    return {
        store,
        // UTC keeps the send window at 09:00-11:00 UTC, matching the follow-up scheduler tests.
        zone: 'UTC',
        random: () => 0,
        pause: async () => {},
        now: clock.now,
    }
}

// 2026-10-06 is a Tuesday (inside the Tue-Thu window). 2026-10-05 is a Monday (outside it).

test('sends a due row that is inside the send window', async () => {
    const store = new MemoryStore([row({ due_at: '2026-10-06T09:00:00.000Z' })])
    const clock = new Clock(new Date('2026-10-06T09:30:00.000Z'))
    const summary = await runScheduledApplicationSends(deps(store, clock))

    assert.equal(summary.due, 1)
    assert.equal(summary.sent, 1)
    assert.equal(summary.rescheduled, 0)
    assert.deepEqual(store.sent, ['app-1'])
    assert.equal(store.rows.get('app-1')!.status, 'sent')
})

test('reschedules a due row to a later slot when outside the send window', async () => {
    const store = new MemoryStore([row({ due_at: '2026-10-05T09:00:00.000Z' })])
    const clock = new Clock(new Date('2026-10-05T09:30:00.000Z')) // Monday -- outside the window
    const summary = await runScheduledApplicationSends(deps(store, clock))

    assert.equal(summary.due, 1)
    assert.equal(summary.sent, 0)
    assert.equal(summary.rescheduled, 1)
    assert.deepEqual(store.sent, [])
    const moved = store.rows.get('app-1')!
    assert.equal(moved.status, 'scheduled')
    assert.ok(Date.parse(moved.due_at) > clock.current.getTime())
})

test('leaves a row that is not yet due untouched', async () => {
    const store = new MemoryStore([row({ due_at: '2026-10-08T09:00:00.000Z' })])
    const clock = new Clock(new Date('2026-10-06T09:30:00.000Z'))
    const summary = await runScheduledApplicationSends(deps(store, clock))

    assert.equal(summary.due, 0)
    assert.equal(summary.sent, 0)
    assert.equal(summary.rescheduled, 0)
    assert.equal(store.rows.get('app-1')!.due_at, '2026-10-08T09:00:00.000Z')
})

test('a run sends at most MAX_SENDS_PER_RUN rows; the rest move to a later slot', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row({ id: `app-${i + 1}`, due_at: '2026-10-06T09:00:00.000Z' }))
    const store = new MemoryStore(rows)
    const clock = new Clock(new Date('2026-10-06T09:00:00.000Z'))
    const summary = await runScheduledApplicationSends(deps(store, clock))

    assert.equal(summary.due, 10)
    assert.equal(summary.sent, 8)
    assert.equal(summary.rescheduled, 2)
})

test('a send failure is recorded as failed without throwing out of the run', async () => {
    const store = new MemoryStore([row()])
    store.sendError = new Error('smtp down')
    const clock = new Clock(new Date('2026-10-06T09:30:00.000Z'))
    const summary = await runScheduledApplicationSends(deps(store, clock))

    assert.equal(summary.sent, 0)
    assert.equal(summary.failed, 1)
})
