// Command center derivation (lib/dashboard/command-center.ts). Pure functions over plain records.
// No database, Supabase, OpenAI or SMTP is involved.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildCommandCenter,
    deriveNextAction,
    nextActionLabel,
    SECTION_LIMITS,
    type DashboardEmail,
    type DashboardJob,
} from '../lib/dashboard/command-center'

const ME = 'user-me'
const OTHER = 'user-other'

let seq = 0
const id = (prefix: string) => `${prefix}-${++seq}`

function job(overrides: Partial<DashboardJob> = {}): DashboardJob {
    return {
        id: id('job'),
        user_id: ME,
        title: 'Backend Engineer',
        company: 'Globex',
        recruiter_name: 'Jane Doe',
        recruiter_email: 'jane@globex.com',
        status: 'sent',
        created_at: '2026-09-20T10:00:00.000Z',
        sent_at: '2026-09-21T10:00:00.000Z',
        replied_at: null,
        ...overrides,
    }
}

function email(overrides: Partial<DashboardEmail> & { job_id: string }): DashboardEmail {
    return {
        id: id('mail'),
        user_id: ME,
        kind: 'application',
        follow_up_number: null,
        status: 'sent',
        due_at: null,
        sent_at: '2026-09-21T10:00:00.000Z',
        attempts: 0,
        error_code: null,
        created_at: '2026-09-21T09:59:00.000Z',
        ...overrides,
    }
}

function followUp(overrides: Partial<DashboardEmail> & { job_id: string; follow_up_number: number }): DashboardEmail {
    return email({ kind: 'follow_up', created_at: '2026-09-28T09:00:00.000Z', sent_at: null, ...overrides })
}

const build = (jobs: DashboardJob[], emails: DashboardEmail[] = [], userId = ME) => buildCommandCenter({ userId, jobs, emails })

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

test('with no applications, every section is empty and every count is zero', () => {
    const data = build([], [])
    assert.equal(data.total, 0)
    assert.deepEqual(data.counts, { needsAttention: 0, upcoming: 0, waiting: 0, replied: 0 })
    assert.deepEqual(data.needsAttention, [])
    assert.deepEqual(data.upcomingFollowUps, [])
    assert.deepEqual(data.waiting, [])
    assert.deepEqual(data.replied, [])
    assert.deepEqual(data.recent, [])
    assert.deepEqual(data.table, [])
})

// ---------------------------------------------------------------------------
// Next action derivation, from the real state machine
// ---------------------------------------------------------------------------

test('a new application needs a draft', () => {
    assert.deepEqual(deriveNextAction({ status: 'new' }, []), { kind: 'create_draft', attention: true })
})

test('an application with a draft needs its review', () => {
    const draft = email({ job_id: 'j', kind: 'application', status: 'draft', sent_at: null })
    assert.deepEqual(deriveNextAction({ status: 'draft_created' }, [draft]), { kind: 'review_draft', attention: true })
})

test('a failed application send is resent from the review page', () => {
    const failed = email({ job_id: 'j', kind: 'application', status: 'failed', sent_at: null })
    assert.deepEqual(deriveNextAction({ status: 'draft_created' }, [failed]), { kind: 'resend', attention: true })
})

test('a draft_created job with no draft row falls back to creating one', () => {
    assert.deepEqual(deriveNextAction({ status: 'draft_created' }, []), { kind: 'create_draft', attention: true })
})

test('a sent application with a scheduled follow-up is waiting on a date, not on the user', () => {
    const next = deriveNextAction({ status: 'sent' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'scheduled', due_at: '2026-10-05T09:00:00.000Z' })])
    assert.deepEqual(next, { kind: 'follow_up_scheduled', attention: false, followUpNumber: 1, dueAt: '2026-10-05T09:00:00.000Z' })
})

test('a follow-up being sent right now is reported as in progress, not as something to do', () => {
    const next = deriveNextAction({ status: 'follow_up_1' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'processing' })])
    assert.deepEqual(next, { kind: 'follow_up_sending', attention: false, followUpNumber: 1 })
})

test('a failed follow-up with a retryable error asks for a retry', () => {
    const next = deriveNextAction({ status: 'sent' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'failed', error_code: 'ECONNECTION', attempts: 3 })])
    assert.deepEqual(next, { kind: 'retry_follow_up', attention: true, followUpNumber: 1 })
})

test('a failed follow-up that may have been delivered asks the user to check the sent folder, never to retry', () => {
    for (const code of ['ETIMEDOUT', 'ESOCKET', 'STALE_CLAIM', 'SMTP_FAILED', null]) {
        const next = deriveNextAction({ status: 'sent' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'failed', error_code: code })])
        assert.equal(next.kind, 'check_sent_folder', String(code))
        assert.equal(next.attention, true)
    }
})

test('a manual follow-up draft awaiting review is an action for the user', () => {
    const next = deriveNextAction({ status: 'sent' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'draft' })])
    assert.deepEqual(next, { kind: 'review_draft', attention: true })
})

test('an awaiting application with no follow-up rows is waiting for the recruiter', () => {
    assert.deepEqual(deriveNextAction({ status: 'sent' }, [email({ job_id: 'j' })]), { kind: 'waiting_for_reply', attention: false })
})

test('a replied application needs nothing, and follow-ups have stopped', () => {
    assert.deepEqual(deriveNextAction({ status: 'replied' }, [followUp({ job_id: 'j', follow_up_number: 1, status: 'cancelled', error_code: 'RECIPIENT_REPLIED' })]), { kind: 'replied', attention: false })
})

test('a closed application needs nothing', () => {
    assert.deepEqual(deriveNextAction({ status: 'closed_no_response' }, []), { kind: 'none', attention: false })
})

test('a scheduled follow-up takes precedence over an older failed one', () => {
    const next = deriveNextAction({ status: 'follow_up_1' }, [
        followUp({ job_id: 'j', follow_up_number: 1, status: 'failed', error_code: 'EAUTH' }),
        followUp({ job_id: 'j', follow_up_number: 2, status: 'scheduled', due_at: '2026-10-10T09:00:00.000Z' }),
    ])
    assert.equal(next.kind, 'follow_up_scheduled')
})

test('next action labels describe the action in plain words', () => {
    assert.equal(nextActionLabel({ kind: 'review_draft', attention: true }), 'Review draft')
    assert.equal(nextActionLabel({ kind: 'retry_follow_up', attention: true, followUpNumber: 2 }), 'Retry follow-up 2')
    assert.equal(nextActionLabel({ kind: 'replied', attention: false }), 'Recruiter replied')
    assert.equal(nextActionLabel({ kind: 'waiting_for_reply', attention: false }), 'Waiting for reply')
})

// ---------------------------------------------------------------------------
// Categorization and sections
// ---------------------------------------------------------------------------

test('needs attention holds drafts, retryable failures and new applications, and nothing that only waits', () => {
    const draftJob = job({ status: 'draft_created' })
    const newJob = job({ status: 'new', sent_at: null })
    const retryJob = job({ status: 'sent' })
    const waitingJob = job({ status: 'sent' })
    const data = build(
        [draftJob, newJob, retryJob, waitingJob],
        [
            email({ job_id: draftJob.id, kind: 'application', status: 'draft', sent_at: null }),
            followUp({ job_id: retryJob.id, follow_up_number: 1, status: 'failed', error_code: 'ECONNECTION' }),
        ]
    )
    const attention = data.needsAttention.map((c) => c.jobId).sort()
    assert.deepEqual(attention, [draftJob.id, newJob.id, retryJob.id].sort())
    assert.equal(data.counts.needsAttention, 3)
    assert.equal(data.waiting.some((c) => c.jobId === waitingJob.id), true)
    assert.equal(data.waiting.some((c) => c.jobId === retryJob.id), false)
})

test('attention items show problems first, then drafts, then new work, oldest first within each kind', () => {
    const newer = job({ status: 'new', created_at: '2026-10-01T10:00:00.000Z' })
    const older = job({ status: 'new', created_at: '2026-09-01T10:00:00.000Z' })
    const draft = job({ status: 'draft_created', created_at: '2026-08-01T10:00:00.000Z' })
    const checkSent = job({ status: 'sent', created_at: '2026-10-02T10:00:00.000Z' })
    const data = build(
        [newer, older, draft, checkSent],
        [
            email({ job_id: draft.id, kind: 'application', status: 'draft', sent_at: null }),
            followUp({ job_id: checkSent.id, follow_up_number: 1, status: 'failed', error_code: 'ETIMEDOUT' }),
        ]
    )
    assert.deepEqual(data.needsAttention.map((c) => c.jobId), [checkSent.id, draft.id, older.id, newer.id])
})

test('upcoming follow-ups are the next scheduled ones, soonest first, with recruiter and role', () => {
    const later = job({ company: 'Later Co', recruiter_email: 'a@later.com' })
    const sooner = job({ company: 'Sooner Co', recruiter_email: 'b@sooner.com' })
    const data = build(
        [later, sooner],
        [
            followUp({ job_id: later.id, follow_up_number: 1, status: 'scheduled', due_at: '2026-10-09T09:00:00.000Z' }),
            followUp({ job_id: sooner.id, follow_up_number: 1, status: 'scheduled', due_at: '2026-10-05T09:00:00.000Z' }),
        ]
    )
    assert.deepEqual(data.upcomingFollowUps.map((u) => u.company), ['Sooner Co', 'Later Co'])
    assert.equal(data.upcomingFollowUps[0].recruiterEmail, 'b@sooner.com')
    assert.equal(data.upcomingFollowUps[0].number, 1)
    assert.equal(data.counts.upcoming, 2)
})

test('the upcoming list is capped, but the count is not', () => {
    const jobs = Array.from({ length: SECTION_LIMITS.upcoming + 3 }, () => job())
    const emails = jobs.map((j, i) => followUp({ job_id: j.id, follow_up_number: 1, status: 'scheduled', due_at: new Date(Date.UTC(2026, 9, 10 + i)).toISOString() }))
    const data = build(jobs, emails)
    assert.equal(data.upcomingFollowUps.length, SECTION_LIMITS.upcoming)
    assert.equal(data.counts.upcoming, jobs.length)
})

test('replied applications show the reply date, newest reply first, and have no upcoming follow-up', () => {
    const early = job({ status: 'replied', replied_at: '2026-09-25T10:00:00.000Z' })
    const late = job({ status: 'replied', replied_at: '2026-09-30T10:00:00.000Z' })
    const data = build([early, late], [
        followUp({ job_id: late.id, follow_up_number: 1, status: 'cancelled', error_code: 'RECIPIENT_REPLIED' }),
    ])
    assert.deepEqual(data.replied.map((c) => c.jobId), [late.id, early.id])
    assert.equal(data.replied[0].repliedAt, '2026-09-30T10:00:00.000Z')
    assert.equal(data.replied[0].nextFollowUp, null)
    assert.equal(data.upcomingFollowUps.length, 0)
    assert.equal(data.counts.replied, 2)
    assert.equal(data.replied[0].nextAction.kind, 'replied')
})

test('waiting for reply lists sent applications with no action, longest-waiting first', () => {
    const recent = job({ sent_at: '2026-10-04T10:00:00.000Z' })
    const longest = job({ sent_at: '2026-09-01T10:00:00.000Z' })
    const data = build([recent, longest])
    assert.deepEqual(data.waiting.map((c) => c.jobId), [longest.id, recent.id])
    assert.equal(data.counts.waiting, 2)
})

test('the sent date falls back to the sent email when the job row has none', () => {
    const j = job({ sent_at: null })
    const data = build([j], [email({ job_id: j.id, status: 'sent', sent_at: '2026-09-22T08:00:00.000Z' })])
    assert.equal(data.table[0].sentAt, '2026-09-22T08:00:00.000Z')
})

test('recent applications are the newest by creation, and the table holds the rest up to its cap', () => {
    const jobs = Array.from({ length: SECTION_LIMITS.table + 5 }, (_, i) =>
        job({ status: 'new', created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() })
    )
    const data = build(jobs)
    assert.equal(data.recent.length, SECTION_LIMITS.recent)
    assert.equal(data.recent[0].jobId, jobs[jobs.length - 1].id)
    assert.equal(data.table.length, SECTION_LIMITS.table)
    assert.equal(data.total, jobs.length)
})

// ---------------------------------------------------------------------------
// User isolation
// ---------------------------------------------------------------------------

test("another user's applications never appear, even when passed in", () => {
    const mine = job()
    const theirs = job({ user_id: OTHER, status: 'draft_created', company: 'Secret Co' })
    const data = build([mine, theirs], [
        email({ job_id: theirs.id, user_id: OTHER, kind: 'application', status: 'draft', sent_at: null }),
    ])
    assert.equal(data.total, 1)
    assert.equal(data.table.some((c) => c.company === 'Secret Co'), false)
    assert.equal(data.needsAttention.length, 0)
})

test("another user's email attached to my job id is ignored", () => {
    const mine = job({ status: 'sent' })
    const data = build([mine], [
        followUp({ job_id: mine.id, user_id: OTHER, follow_up_number: 1, status: 'failed', error_code: 'ECONNECTION' }),
    ])
    assert.equal(data.needsAttention.length, 0)
    assert.equal(data.waiting[0].nextAction.kind, 'waiting_for_reply')
})

test('an email of mine attached to someone else\'s job does not change their application', () => {
    const theirs = job({ user_id: OTHER, status: 'sent' })
    const data = build([], [followUp({ job_id: theirs.id, follow_up_number: 1, status: 'scheduled', due_at: '2026-10-05T09:00:00.000Z' })])
    assert.equal(data.total, 0)
    assert.equal(data.upcomingFollowUps.length, 0)
})

test('the dashboard counts only the user it is built for', () => {
    const jobs = [job(), job({ user_id: OTHER }), job({ user_id: OTHER, status: 'replied', replied_at: '2026-09-30T10:00:00.000Z' })]
    const data = build(jobs, [], ME)
    assert.equal(data.total, 1)
    assert.equal(data.counts.replied, 0)
})
