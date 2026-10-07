// Inbox matching and sync (lib/inbox). Runs on plain records and an in-memory store and provider.
// No Gmail, IMAP, Supabase or OpenAI call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { addressOf, extractMessageIds, normalizeMessageId, parseHeaderBlock } from '../lib/inbox/headers'
import { matchInbound, type InboundMessage, type OutboundEmail } from '../lib/inbox/match'
import { runInboxSync, type InboxProvider, type InboxStore, type MarkRepliedInput } from '../lib/inbox/sync'
import { setLogSink } from '../lib/log/logger'

setLogSink(() => {})

const SELF = 'me@example.com'
const RECRUITER = 'recruiter@globex.com'
const SENT_AT = '2026-10-01T09:00:00.000Z'
const AFTER = '2026-10-02T10:00:00.000Z'
const BEFORE = '2026-09-30T10:00:00.000Z'

const OUT_A: OutboundEmail = {
    user_id: 'user-a',
    job_id: 'job-a',
    job_status: 'sent',
    job_title: 'Backend Engineer',
    job_company: 'Globex Corporation',
    to_email: RECRUITER,
    message_id: normalizeMessageId('<app-a@example.com>'),
    sent_at: SENT_AT,
}

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
    return {
        messageId: '<reply-1@globex.com>',
        inReplyTo: null,
        references: null,
        from: RECRUITER,
        subject: 'Re: hello',
        date: AFTER,
        automated: false,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

test('message ids are compared without angle brackets and in lowercase', () => {
    assert.equal(normalizeMessageId(' <ABC@Example.com> '), 'abc@example.com')
    assert.deepEqual(extractMessageIds('<one@x.com> <two@x.com>'), ['one@x.com', 'two@x.com'])
    assert.deepEqual(extractMessageIds(null), [])
})

test('a folded References header is read in full', () => {
    const block = 'Subject: Re: hi\r\nReferences: <first@x.com>\r\n <second@x.com>\r\nFrom: r@x.com\r\n'
    const headers = parseHeaderBlock(block)
    assert.deepEqual(extractMessageIds(headers.references), ['first@x.com', 'second@x.com'])
    assert.equal(headers.from, 'r@x.com')
})

test('an address is read from a display name form or a bare address', () => {
    assert.equal(addressOf('Jane Doe <Jane@Globex.com>'), 'jane@globex.com')
    assert.equal(addressOf('jane@globex.com'), 'jane@globex.com')
    assert.equal(addressOf(null), null)
})

// ---------------------------------------------------------------------------
// Matching: strong signals
// ---------------------------------------------------------------------------

test('a reply whose In-Reply-To names our sent Message-ID is matched to that application', () => {
    const outcome = matchInbound(inbound({ inReplyTo: '<app-a@example.com>' }), [OUT_A], SELF)
    assert.deepEqual(outcome, { kind: 'matched', userId: 'user-a', jobId: 'job-a', method: 'in_reply_to' })
})

test('a References header naming our Message-ID is matched when In-Reply-To is absent', () => {
    const outcome = matchInbound(inbound({ references: '<other@x.com> <app-a@example.com>' }), [OUT_A], SELF)
    assert.deepEqual(outcome, { kind: 'matched', userId: 'user-a', jobId: 'job-a', method: 'references' })
})

test('a sender that is the recruiter we wrote to, with one matching application, is matched', () => {
    const outcome = matchInbound(inbound(), [OUT_A], SELF)
    assert.deepEqual(outcome, { kind: 'matched', userId: 'user-a', jobId: 'job-a', method: 'sender' })
})

test('a message from our own address is never a reply', () => {
    const outcome = matchInbound(inbound({ from: SELF, inReplyTo: '<app-a@example.com>' }), [OUT_A], SELF)
    assert.deepEqual(outcome, { kind: 'ignored', reason: 'own_address' })
})

// ---------------------------------------------------------------------------
// Matching: false positives
// ---------------------------------------------------------------------------

test('a subject match alone never marks an application as replied', () => {
    const outcome = matchInbound(
        inbound({ from: 'someone-else@other.com', subject: 'Backend Engineer application follow-up' }),
        [OUT_A],
        SELF
    )
    assert.notEqual(outcome.kind, 'matched')
    assert.deepEqual(outcome, { kind: 'review', jobId: 'job-a', reason: 'subject_only' })
})

test('a message with an unrelated subject and sender is ignored', () => {
    const outcome = matchInbound(inbound({ from: 'newsletter@other.com', subject: 'Weekly digest' }), [OUT_A], SELF)
    assert.deepEqual(outcome, { kind: 'ignored', reason: 'no_match' })
})

test('when the same recruiter address has two applications and no header identifies one, nothing is marked', () => {
    const second: OutboundEmail = { ...OUT_A, job_id: 'job-b', message_id: normalizeMessageId('<app-b@example.com>') }
    const outcome = matchInbound(inbound(), [OUT_A, second], SELF)
    assert.deepEqual(outcome, { kind: 'ignored', reason: 'ambiguous' })
})

test('a header that points at two different applications is ambiguous, not a match', () => {
    const second: OutboundEmail = { ...OUT_A, job_id: 'job-b', message_id: normalizeMessageId('<app-b@example.com>') }
    const outcome = matchInbound(inbound({ inReplyTo: '<app-a@example.com> <app-b@example.com>' }), [OUT_A, second], SELF)
    assert.deepEqual(outcome, { kind: 'ignored', reason: 'ambiguous' })
})

test('a message received before we sent the email cannot be a reply to it', () => {
    const outcome = matchInbound(inbound({ inReplyTo: '<app-a@example.com>', date: BEFORE }), [OUT_A], SELF)
    assert.notEqual(outcome.kind, 'matched')
})

test('automated mail (out of office, bounces, no-reply senders) is ignored', () => {
    assert.deepEqual(matchInbound(inbound({ inReplyTo: '<app-a@example.com>', automated: true }), [OUT_A], SELF), { kind: 'ignored', reason: 'automated' })
})

test('a message without a Message-ID cannot be recorded, so it is ignored', () => {
    assert.deepEqual(matchInbound(inbound({ messageId: null, inReplyTo: '<app-a@example.com>' }), [OUT_A], SELF), { kind: 'ignored', reason: 'no_message_id' })
})

test('a job that already has a reply, or was closed, is not matched again', () => {
    const replied: OutboundEmail = { ...OUT_A, job_status: 'replied' }
    assert.deepEqual(matchInbound(inbound({ inReplyTo: '<app-a@example.com>' }), [replied], SELF), { kind: 'ignored', reason: 'not_awaiting' })
})

test('a match returns the owner of the sent email, so a reply cannot be attributed to another user', () => {
    const other: OutboundEmail = { ...OUT_A, user_id: 'user-b', job_id: 'job-b', message_id: normalizeMessageId('<app-b@example.com>') }
    const outcome = matchInbound(inbound({ inReplyTo: '<app-b@example.com>' }), [OUT_A, other], SELF)
    assert.deepEqual(outcome, { kind: 'matched', userId: 'user-b', jobId: 'job-b', method: 'in_reply_to' })
})

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

class MemoryInbox implements InboxStore {
    readonly jobs = new Map<string, { user_id: string; status: string; reply_message_id: string | null; replied_at: string | null }>()
    readonly followUps = new Map<string, { user_id: string; job_id: string; status: string }>()
    readonly marks: MarkRepliedInput[] = []
    failCancel = false

    constructor(public outbound: OutboundEmail[]) {
        for (const o of outbound) {
            this.jobs.set(o.job_id, { user_id: o.user_id, status: o.job_status, reply_message_id: null, replied_at: null })
        }
    }

    async loadOutbound() {
        return this.outbound
    }

    async markReplied(input: MarkRepliedInput) {
        const job = this.jobs.get(input.jobId)
        if (!job || job.user_id !== input.userId) return 'ineligible' as const
        if (job.status === 'replied') {
            return job.reply_message_id === input.replyMessageId ? ('already' as const) : ('ineligible' as const)
        }
        if (!['sent', 'follow_up_1', 'follow_up_2'].includes(job.status)) return 'ineligible' as const
        job.status = 'replied'
        job.reply_message_id = input.replyMessageId
        job.replied_at = input.repliedAt.toISOString()
        this.marks.push(input)
        return 'marked' as const
    }

    async cancelPendingFollowUps(userId: string, jobId: string) {
        if (this.failCancel) throw new Error('database unavailable')
        let count = 0
        for (const f of this.followUps.values()) {
            if (f.user_id === userId && f.job_id === jobId && f.status === 'scheduled') {
                f.status = 'cancelled'
                count++
            }
        }
        return count
    }
}

function provider(messages: InboundMessage[]): InboxProvider {
    return { listRecent: async () => messages }
}

const NOW = new Date('2026-10-03T08:00:00.000Z')
const deps = (store: MemoryInbox, messages: InboundMessage[]) => ({ provider: provider(messages), store, selfAddress: SELF, now: () => NOW })

test('a matched reply marks the application replied and cancels its scheduled follow-ups', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled' })
    store.followUps.set('f2', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled' })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(store.jobs.get('job-a')!.reply_message_id, 'reply-1@globex.com')
    assert.equal(summary.marked, 1)
    assert.equal(summary.follow_ups_cancelled, 2)
    assert.deepEqual([...store.followUps.values()].map((f) => f.status), ['cancelled', 'cancelled'])
})

test('a reply does not cancel a follow-up that is already sent or in progress', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('sent', { user_id: 'user-a', job_id: 'job-a', status: 'sent' })
    store.followUps.set('busy', { user_id: 'user-a', job_id: 'job-a', status: 'processing' })

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.followUps.get('sent')!.status, 'sent')
    assert.equal(store.followUps.get('busy')!.status, 'processing')
})

test('the same inbound message seen twice in one run is recorded once', async () => {
    const store = new MemoryInbox([OUT_A])
    const message = inbound({ inReplyTo: '<app-a@example.com>' })

    const summary = await runInboxSync(deps(store, [message, message]))

    assert.equal(store.marks.length, 1)
    assert.equal(summary.marked, 1)
    assert.equal(summary.already_recorded, 1)
})

test('the same message seen again in a later run changes nothing', async () => {
    const store = new MemoryInbox([OUT_A])
    const message = inbound({ inReplyTo: '<app-a@example.com>' })
    await runInboxSync(deps(store, [message]))

    const second = await runInboxSync(deps(store, [message]))

    assert.equal(store.marks.length, 1)
    assert.equal(second.marked, 0)
})

test('a later, different reply to an already replied application does not change the record', async () => {
    const store = new MemoryInbox([OUT_A])
    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    const later = inbound({ messageId: '<reply-2@globex.com>', inReplyTo: '<app-a@example.com>', date: '2026-10-02T12:00:00.000Z' })
    const summary = await runInboxSync(deps(store, [later]))

    assert.equal(store.jobs.get('job-a')!.reply_message_id, 'reply-1@globex.com')
    assert.equal(summary.marked, 0)
})

test('a subject-only match is reported for review and changes nothing', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled' })

    const summary = await runInboxSync(deps(store, [inbound({ from: 'unrelated@other.com', subject: 'About the Globex Corporation role' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'sent')
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
    assert.equal(summary.review, 1)
    assert.equal(summary.marked, 0)
})

test('one user\'s reply never touches another user\'s application', async () => {
    const otherUser: OutboundEmail = { ...OUT_A, user_id: 'user-b', job_id: 'job-b', message_id: normalizeMessageId('<app-b@example.com>') }
    const store = new MemoryInbox([OUT_A, otherUser])
    store.followUps.set('b1', { user_id: 'user-b', job_id: 'job-b', status: 'scheduled' })

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(store.jobs.get('job-b')!.status, 'sent')
    assert.equal(store.followUps.get('b1')!.status, 'scheduled')
})

test('a failed cancel still leaves the job replied, so the scheduler will not send', async () => {
    const store = new MemoryInbox([OUT_A])
    store.failCancel = true
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled' })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(summary.marked, 1)
    assert.equal(summary.follow_ups_cancelled, 0)
})

test('with no sent emails there is nothing to match and nothing changes', async () => {
    const store = new MemoryInbox([])
    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))
    assert.equal(summary.marked, 0)
    assert.equal(summary.ignored, 1)
})
