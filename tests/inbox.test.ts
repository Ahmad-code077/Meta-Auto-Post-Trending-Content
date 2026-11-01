// Inbox matching and sync (lib/inbox). Runs on plain records and an in-memory store and provider.
// No Gmail, IMAP, Supabase or OpenAI call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import { addressOf, extractMessageIds, normalizeMessageId, parseHeaderBlock } from '../lib/inbox/headers'
import { matchInbound, type InboundMessage, type OutboundEmail } from '../lib/inbox/match'
import { runInboxSync, type InboxProvider, type InboxStore, type RecordClassifiedReplyInput, type RecordReplySeenInput } from '../lib/inbox/sync'
import { classifyReply, type ReplyClassification } from '../lib/inbox/classify-reply'
import { extractReplyText } from '../lib/inbox/body'
import { withinReplyGraceWindow } from '../lib/followups/policy'
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
    job_last_inbound_message_id: null,
    to_email: RECRUITER,
    message_id: normalizeMessageId('<app-a@example.com>'),
    sent_at: SENT_AT,
}

function inbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
    return {
        uid: 1,
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

interface MemoryJob {
    user_id: string
    status: string
    reply_message_id: string | null
    replied_at: string | null
    reply_classification: ReplyClassification | null
    last_inbound_message_id: string | null
}

interface MemoryFollowUp {
    user_id: string
    job_id: string
    status: string
    due_at: string | null
}

const AWAITING = ['sent', 'follow_up_1', 'follow_up_2']

class MemoryInbox implements InboxStore {
    readonly jobs = new Map<string, MemoryJob>()
    readonly followUps = new Map<string, MemoryFollowUp>()
    readonly marks: RecordClassifiedReplyInput[] = []
    readonly seenReplies: RecordReplySeenInput[] = []
    failCancel = false

    constructor(public outbound: OutboundEmail[]) {
        for (const o of outbound) {
            this.jobs.set(o.job_id, {
                user_id: o.user_id,
                status: o.job_status,
                reply_message_id: null,
                replied_at: null,
                reply_classification: null,
                last_inbound_message_id: o.job_last_inbound_message_id,
            })
        }
    }

    async loadOutbound() {
        // Mirrors the real store: the outbound snapshot carries each job's current dedup cursor.
        return this.outbound.map((o) => ({ ...o, job_last_inbound_message_id: this.jobs.get(o.job_id)?.last_inbound_message_id ?? null }))
    }

    // Mirrors lib/inbox/store.ts's recordClassifiedReply: looks up the job's one pending follow-up,
    // decides awaiting_review vs. immediate auto-confirm with the same pure rule, and only then writes.
    async recordClassifiedReply(input: RecordClassifiedReplyInput) {
        const job = this.jobs.get(input.jobId)
        if (!job || job.user_id !== input.userId) return 'ineligible' as const
        if (!AWAITING.includes(job.status)) {
            return job.reply_message_id === input.replyMessageId ? ('already' as const) : ('ineligible' as const)
        }

        const pendingEntry = [...this.followUps.entries()].find(
            ([, f]) => f.user_id === input.userId && f.job_id === input.jobId && f.status === 'scheduled'
        )
        const dueAt = pendingEntry?.[1].due_at ? new Date(pendingEntry[1].due_at) : null
        const autoConfirm = withinReplyGraceWindow(dueAt, input.now)

        job.reply_message_id = input.replyMessageId
        job.reply_classification = input.classification
        if (autoConfirm) {
            job.status = 'replied'
            job.replied_at = input.now.toISOString()
            // A cancel failure is only tidying: the job is already replied, so the scheduler already
            // refuses to send regardless -- mirrors the try/catch in lib/inbox/store.ts.
            if (pendingEntry && !this.failCancel) pendingEntry[1].status = 'cancelled'
        } else {
            job.status = 'awaiting_review'
        }

        this.marks.push(input)
        return autoConfirm ? ('auto_confirmed' as const) : ('awaiting_review' as const)
    }

    async recordReplySeen(input: RecordReplySeenInput) {
        const job = this.jobs.get(input.jobId)
        if (!job || job.user_id !== input.userId) return 'ineligible' as const
        if (!AWAITING.includes(job.status)) return 'ineligible' as const
        if (job.last_inbound_message_id === input.messageId) return 'already' as const
        job.last_inbound_message_id = input.messageId
        job.reply_classification = input.classification
        this.seenReplies.push(input)
        return 'recorded' as const
    }
}

function provider(messages: InboundMessage[], bodies: Record<number, string | null> = {}): InboxProvider {
    return {
        listRecent: async () => messages,
        fetchBody: async (uid) => (uid in bodies ? bodies[uid] : 'thanks, looking forward to next steps'),
    }
}

const NOW = new Date('2026-10-03T08:00:00.000Z')
// Outside the 2-day grace window -- an engaged/rejected reply goes to awaiting_review.
const FAR_DUE = '2026-10-10T09:00:00.000Z'
// Inside the 2-day grace window -- an engaged/rejected reply is auto-confirmed immediately.
const NEAR_DUE = '2026-10-04T09:00:00.000Z'

// The default fake classifier returns 'engaged' unless a test overrides it.
const deps = (
    store: MemoryInbox,
    messages: InboundMessage[],
    options: { classification?: ReplyClassification; bodies?: Record<number, string | null>; calls?: string[] } = {}
) => ({
    provider: provider(messages, options.bodies),
    store,
    selfAddress: SELF,
    now: () => NOW,
    classify: async (body: string) => {
        options.calls?.push(body)
        return options.classification ?? 'engaged'
    },
})

test('an engaged reply whose follow-up is not due soon goes to awaiting_review, follow-up untouched', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: FAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    const job = store.jobs.get('job-a')!
    assert.equal(job.status, 'awaiting_review')
    assert.equal(job.reply_message_id, 'reply-1@globex.com')
    assert.equal(job.replied_at, null)
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
    assert.equal(summary.awaiting_review, 1)
    assert.equal(summary.marked, 0)
    assert.equal(summary.follow_ups_cancelled, 0)
})

test('a rejected reply behaves the same as engaged: not due soon -> awaiting_review', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: FAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })], { classification: 'rejected' }))

    const job = store.jobs.get('job-a')!
    assert.equal(job.status, 'awaiting_review')
    assert.equal(job.reply_classification, 'rejected')
    assert.equal(summary.awaiting_review, 1)
})

test('an engaged reply whose follow-up is due within 2 days is auto-confirmed immediately', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    const job = store.jobs.get('job-a')!
    assert.equal(job.status, 'replied')
    assert.equal(job.reply_message_id, 'reply-1@globex.com')
    assert.equal(summary.marked, 1)
    assert.equal(summary.awaiting_review, 0)
    assert.equal(summary.follow_ups_cancelled, 1)
    assert.equal(store.followUps.get('f1')!.status, 'cancelled')
})

test('a rejected reply due within 2 days is also auto-confirmed immediately', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })], { classification: 'rejected' }))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(summary.marked, 1)
})

test('exactly 2 days out still counts as within the grace window (inclusive boundary)', async () => {
    const store = new MemoryInbox([OUT_A])
    const exactlyTwoDays = new Date(NOW.getTime() + 2 * 86_400_000).toISOString()
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: exactlyTwoDays })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(summary.marked, 1)
})

test('with no pending follow-up at all, an engaged reply goes to awaiting_review, never auto-confirmed', async () => {
    const store = new MemoryInbox([OUT_A])

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'awaiting_review')
    assert.equal(summary.awaiting_review, 1)
    assert.equal(summary.marked, 0)
})

test('a reply does not disturb a follow-up that is already sent or in progress', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('sent', { user_id: 'user-a', job_id: 'job-a', status: 'sent', due_at: null })
    store.followUps.set('busy', { user_id: 'user-a', job_id: 'job-a', status: 'processing', due_at: null })

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.followUps.get('sent')!.status, 'sent')
    assert.equal(store.followUps.get('busy')!.status, 'processing')
})

// ---------------------------------------------------------------------------
// Sync: classification branches
// ---------------------------------------------------------------------------

test('a holding reply is recorded without ending the awaiting-reply period, and follow-ups keep running', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: FAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })], { classification: 'holding' }))

    const job = store.jobs.get('job-a')!
    assert.equal(job.status, 'sent')
    assert.equal(job.reply_message_id, null)
    assert.equal(job.reply_classification, 'holding')
    assert.equal(job.last_inbound_message_id, 'reply-1@globex.com')
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
    assert.equal(summary.marked, 0)
    assert.equal(summary.seen, 1)
    assert.equal(summary.follow_ups_cancelled, 0)
})

test('an auto_reply is treated the same as holding -- recorded, but follow-ups keep running', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: FAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })], { classification: 'auto_reply' }))

    const job = store.jobs.get('job-a')!
    assert.equal(job.status, 'sent')
    assert.equal(job.reply_classification, 'auto_reply')
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
    assert.equal(summary.seen, 1)
})

test('the classifier receives the body text fetched for the matched message', async () => {
    const store = new MemoryInbox([OUT_A])
    const calls: string[] = []

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>', uid: 42 })], {
        classification: 'holding',
        bodies: { 42: 'Thanks, still reviewing applications.' },
        calls,
    }))

    assert.deepEqual(calls, ['Thanks, still reviewing applications.'])
})

test('a message whose body could not be fetched is still classified, from an empty body', async () => {
    const store = new MemoryInbox([OUT_A])
    const calls: string[] = []

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>', uid: 7 })], {
        classification: 'holding',
        bodies: { 7: null },
        calls,
    }))

    assert.deepEqual(calls, [''])
})

test('a holding reply already seen on an earlier run is not reclassified', async () => {
    const store = new MemoryInbox([OUT_A])
    const calls: string[] = []
    const message = inbound({ inReplyTo: '<app-a@example.com>' })

    const first = await runInboxSync(deps(store, [message], { classification: 'holding', calls }))
    assert.equal(first.seen, 1)

    const second = await runInboxSync(deps(store, [message], { classification: 'holding', calls }))

    assert.equal(second.seen, 0)
    assert.equal(second.already_recorded, 1)
    assert.equal(calls.length, 1, 'the model is not called a second time for an already-seen reply')
})

test('a second, different reply on the same job is still classified on its own merits', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })
    const first = inbound({ inReplyTo: '<app-a@example.com>' })
    await runInboxSync(deps(store, [first], { classification: 'holding' }))

    const later = inbound({ messageId: '<reply-2@globex.com>', inReplyTo: '<app-a@example.com>', date: '2026-10-02T12:00:00.000Z' })
    const summary = await runInboxSync(deps(store, [later], { classification: 'engaged' }))

    assert.equal(summary.marked, 1)
    assert.equal(store.jobs.get('job-a')!.status, 'replied')
})

test('the same inbound message seen twice in one run is recorded once', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })
    const message = inbound({ inReplyTo: '<app-a@example.com>' })

    const summary = await runInboxSync(deps(store, [message, message]))

    assert.equal(store.marks.length, 1)
    assert.equal(summary.marked, 1)
    assert.equal(summary.already_recorded, 1)
})

test('the same message seen again in a later run changes nothing', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })
    const message = inbound({ inReplyTo: '<app-a@example.com>' })
    await runInboxSync(deps(store, [message]))

    const second = await runInboxSync(deps(store, [message]))

    assert.equal(store.marks.length, 1)
    assert.equal(second.marked, 0)
})

test('a later, different reply to an already replied application does not change the record', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })
    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    const later = inbound({ messageId: '<reply-2@globex.com>', inReplyTo: '<app-a@example.com>', date: '2026-10-02T12:00:00.000Z' })
    const summary = await runInboxSync(deps(store, [later]))

    assert.equal(store.jobs.get('job-a')!.reply_message_id, 'reply-1@globex.com')
    assert.equal(summary.marked, 0)
})

test('a subject-only match is reported for review and changes nothing', async () => {
    const store = new MemoryInbox([OUT_A])
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: FAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ from: 'unrelated@other.com', subject: 'About the Globex Corporation role' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'sent')
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
    assert.equal(summary.review, 1)
    assert.equal(summary.marked, 0)
})

test('one user\'s reply never touches another user\'s application', async () => {
    const otherUser: OutboundEmail = { ...OUT_A, user_id: 'user-b', job_id: 'job-b', message_id: normalizeMessageId('<app-b@example.com>') }
    const store = new MemoryInbox([OUT_A, otherUser])
    store.followUps.set('a1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })
    store.followUps.set('b1', { user_id: 'user-b', job_id: 'job-b', status: 'scheduled', due_at: NEAR_DUE })

    await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(store.jobs.get('job-b')!.status, 'sent')
    assert.equal(store.followUps.get('b1')!.status, 'scheduled')
})

test('a failed cancel still leaves the job replied, so the scheduler will not send', async () => {
    const store = new MemoryInbox([OUT_A])
    store.failCancel = true
    store.followUps.set('f1', { user_id: 'user-a', job_id: 'job-a', status: 'scheduled', due_at: NEAR_DUE })

    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))

    assert.equal(store.jobs.get('job-a')!.status, 'replied')
    assert.equal(summary.marked, 1)
    // The job is replied regardless -- the scheduler already refuses to send for it. The failed
    // cancel itself is reflected here: the follow-up row was not actually updated.
    assert.equal(store.followUps.get('f1')!.status, 'scheduled')
})

test('with no sent emails there is nothing to match and nothing changes', async () => {
    const store = new MemoryInbox([])
    const summary = await runInboxSync(deps(store, [inbound({ inReplyTo: '<app-a@example.com>' })]))
    assert.equal(summary.marked, 0)
    assert.equal(summary.ignored, 1)
})

// ---------------------------------------------------------------------------
// classifyReply: the model call is faked, so these never hit OpenAI
// ---------------------------------------------------------------------------

function modelReturning(classification: string) {
    return async () => ({ classification })
}

test('each valid category is returned as-is', async () => {
    for (const c of ['engaged', 'holding', 'rejected', 'auto_reply'] as const) {
        assert.equal(await classifyReply('some reply text', modelReturning(c)), c)
    }
})

test('an empty or whitespace-only body is holding without calling the model', async () => {
    let called = false
    const call = async () => { called = true; return { classification: 'engaged' } }
    assert.equal(await classifyReply('', call), 'holding')
    assert.equal(await classifyReply('   \n  ', call), 'holding')
    assert.equal(called, false)
})

test('an unrecognized classification string from the model falls back to holding', async () => {
    assert.equal(await classifyReply('some reply text', modelReturning('maybe')), 'holding')
})

test('a thrown error from the model call falls back to holding, never rejects', async () => {
    const call = async () => { throw new Error('model unavailable') }
    await assert.doesNotReject(async () => {
        const result = await classifyReply('some reply text', call)
        assert.equal(result, 'holding')
    })
})

// ---------------------------------------------------------------------------
// extractReplyText: pure MIME decoding, no IMAP connection needed
// ---------------------------------------------------------------------------

test('the plain-text part of a multipart/alternative message is extracted', async () => {
    const source = [
        'From: Recruiter <recruiter@globex.com>',
        'To: me@example.com',
        'Subject: Re: Backend Engineer',
        'Content-Type: multipart/alternative; boundary="B"',
        '',
        '--B',
        'Content-Type: text/plain',
        '',
        'Thanks, we will be in touch soon.',
        '--B',
        'Content-Type: text/html',
        '',
        '<p>Thanks, we will be in touch soon.</p>',
        '--B--',
        '',
    ].join('\r\n')

    const text = await extractReplyText(source)
    assert.equal(text, 'Thanks, we will be in touch soon.')
})

test('an HTML-only message falls back to a stripped plain-text approximation', async () => {
    const source = [
        'From: Recruiter <recruiter@globex.com>',
        'To: me@example.com',
        'Subject: Re: Backend Engineer',
        'Content-Type: text/html',
        '',
        '<p>Thanks for applying.</p><p>We will <b>review</b> it shortly.</p>',
        '',
    ].join('\r\n')

    const text = await extractReplyText(source)
    assert.ok(text?.includes('Thanks for applying.'))
    assert.ok(text?.includes('We will review it shortly.'))
    assert.ok(!text?.includes('<p>'))
})

test('an unparseable source returns null rather than throwing', async () => {
    assert.equal(await extractReplyText(''), null)
})
