// Tests for the application timeline (lib/timeline/build.ts) and the follow-up filters (lib/timeline/filters.ts).
// They run on plain records, the same shape the review page reads from Supabase. No database, OpenAI or SMTP.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildApplicationTimeline, followUpSummary, type TimelineEmail, type TimelineJob } from '../lib/timeline/build'
import { isFollowUpFilter, jobIdsWithFollowUp } from '../lib/timeline/filters'

const USER = 'user-a'
const OTHER_USER = 'user-b'
const JOB = 'job-a'
const OTHER_JOB = 'job-b'

const job: TimelineJob = {
    id: JOB,
    user_id: USER,
    created_at: '2026-09-28T10:00:00.000Z',
    analyzed_at: '2026-09-28T10:00:05.000Z',
}

function email(overrides: Partial<TimelineEmail> & { id: string }): TimelineEmail {
    return {
        job_id: JOB,
        user_id: USER,
        kind: 'application',
        follow_up_number: null,
        status: 'draft',
        created_at: '2026-09-28T10:01:00.000Z',
        updated_at: '2026-09-28T10:01:00.000Z',
        sent_at: null,
        due_at: null,
        claimed_at: null,
        last_attempt_at: null,
        attempts: 0,
        error_code: null,
        resume_id: null,
        generation: null,
        ...overrides,
    }
}

function followUp(overrides: Partial<TimelineEmail> & { id: string; follow_up_number: number }): TimelineEmail {
    return email({ kind: 'follow_up', created_at: '2026-09-28T10:30:00.000Z', updated_at: '2026-09-28T10:30:00.000Z', ...overrides })
}

const titles = (events: { title: string }[]) => events.map((e) => e.title)

// ---------------------------------------------------------------------------
// Application events
// ---------------------------------------------------------------------------

test('the timeline starts with the job being received, then its analysis', () => {
    const events = buildApplicationTimeline(job, [])
    assert.deepEqual(titles(events), ['Job received', 'Job analysis completed'])
})

test('a sent application shows draft, edit, and sent in that order, with the resume noted', () => {
    const events = buildApplicationTimeline(job, [
        email({
            id: 'app-1',
            status: 'sent',
            created_at: '2026-09-28T10:01:00.000Z',
            generation: { edited_at: '2026-09-28T10:10:00.000Z' },
            sent_at: '2026-09-28T10:20:00.000Z',
            resume_id: 'resume-1',
        }),
    ])
    assert.deepEqual(titles(events), ['Job received', 'Job analysis completed', 'Draft generated', 'Draft edited', 'Application sent'])
    const sent = events.find((e) => e.title === 'Application sent')!
    assert.equal(sent.tone, 'success')
    assert.equal(sent.detail, 'Your resume was attached.')
    assert.equal(sent.at, '2026-09-28T10:20:00.000Z')
})

test('a failed send is shown as a danger event with a generic reason, not the raw error', () => {
    const events = buildApplicationTimeline(job, [email({ id: 'app-1', status: 'failed', updated_at: '2026-09-28T10:05:00.000Z' })])
    const failed = events.find((e) => e.title === 'Sending failed')!
    assert.equal(failed.tone, 'danger')
    assert.match(failed.detail!, /try again from the draft/)
})

// ---------------------------------------------------------------------------
// Follow-up events
// ---------------------------------------------------------------------------

test('a scheduled follow-up shows when it was scheduled and when it is due', () => {
    const events = buildApplicationTimeline(job, [
        email({ id: 'app-1', status: 'sent', sent_at: '2026-09-28T10:20:00.000Z' }),
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'scheduled', due_at: '2026-10-05T09:00:00.000Z', created_at: '2026-09-28T10:20:00.000Z', updated_at: '2026-09-28T10:20:00.000Z' }),
    ])
    const scheduled = events.find((e) => e.title === 'Follow-up #1 scheduled')!
    assert.equal(scheduled.at, '2026-09-28T10:20:00.000Z')
    assert.equal(scheduled.tone, 'neutral')
    assert.equal(events.some((e) => e.title === 'Follow-up #1 rescheduled'), false, 'an untouched schedule is not a reschedule')
})

test('a scheduled follow-up that was changed before it ran shows as rescheduled, with the new due date', () => {
    const events = buildApplicationTimeline(job, [
        followUp({
            id: 'fu-1',
            follow_up_number: 1,
            status: 'scheduled',
            due_at: '2026-10-08T09:00:00.000Z',
            created_at: '2026-09-28T10:20:00.000Z',
            updated_at: '2026-10-01T08:00:00.000Z',
            attempts: 0,
        }),
    ])
    const moved = events.find((e) => e.title === 'Follow-up #1 rescheduled')!
    assert.equal(moved.at, '2026-10-01T08:00:00.000Z')
    assert.equal(moved.dueAt, '2026-10-08T09:00:00.000Z')
})

test('a retry that is waiting shows the earlier attempt count and the next run time', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'scheduled', attempts: 1, due_at: '2026-10-05T10:00:00.000Z', updated_at: '2026-10-05T09:01:00.000Z' }),
    ])
    const retry = events.find((e) => e.title === 'Follow-up #1 retry scheduled')!
    assert.equal(retry.tone, 'warning')
    assert.equal(retry.detail, 'Attempt 1 did not complete.')
    assert.equal(retry.dueAt, '2026-10-05T10:00:00.000Z')
})

test('a follow-up being sent right now shows as being sent', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'processing', attempts: 1, claimed_at: '2026-10-05T09:00:00.000Z' }),
    ])
    const processing = events.find((e) => e.title === 'Follow-up #1 is being sent')!
    assert.equal(processing.at, '2026-10-05T09:00:00.000Z')
    assert.equal(processing.detail, 'Attempt 1.')
})

test('a sent follow-up shows the sent time and nothing about cancellation', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'sent', sent_at: '2026-10-05T09:01:00.000Z', updated_at: '2026-10-05T09:01:00.000Z' }),
    ])
    const sent = events.find((e) => e.title === 'Follow-up #1 sent')!
    assert.equal(sent.tone, 'success')
    assert.equal(sent.at, '2026-10-05T09:01:00.000Z')
    assert.equal(events.some((e) => e.title.includes('cancelled')), false)
})

test('a failed follow-up shows a safe reason and the attempt count, never a raw error', () => {
    const events = buildApplicationTimeline(job, [
        followUp({
            id: 'fu-1',
            follow_up_number: 1,
            status: 'failed',
            attempts: 3,
            error_code: 'ETIMEDOUT',
            last_attempt_at: '2026-10-05T09:30:00.000Z',
            updated_at: '2026-10-05T09:30:00.000Z',
        }),
    ])
    const failed = events.find((e) => e.title === 'Follow-up #1 failed')!
    assert.equal(failed.tone, 'danger')
    assert.equal(failed.at, '2026-10-05T09:30:00.000Z')
    assert.match(failed.detail!, /sent folder/)
    assert.match(failed.detail!, /Attempts: 3/)
})

test('an unknown failure code gets the generic wording, not the code itself', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'failed', error_code: 'SOME_INTERNAL_CODE', updated_at: '2026-10-05T09:30:00.000Z' }),
    ])
    const failed = events.find((e) => e.title === 'Follow-up #1 failed')!
    assert.equal(failed.detail, 'The follow-up failed.')
})

test('a cancelled follow-up shows who cancelled it, and why it was superseded when that happens', () => {
    const byUser = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'cancelled', error_code: 'CANCELLED_BY_USER', updated_at: '2026-10-02T12:00:00.000Z' }),
    ]).find((e) => e.title === 'Follow-up #1 cancelled')!
    assert.equal(byUser.tone, 'warning')
    assert.equal(byUser.detail, 'Cancelled by you.')

    const superseded = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'cancelled', error_code: 'SUPERSEDED', updated_at: '2026-10-02T12:00:00.000Z' }),
    ]).find((e) => e.title === 'Follow-up #1 cancelled')!
    assert.equal(superseded.detail, 'Replaced by a follow-up that was sent.')
})

test('a manual follow-up draft shows as drafted, not scheduled', () => {
    const titlesFor = titles(buildApplicationTimeline(job, [followUp({ id: 'fu-1', follow_up_number: 1, status: 'draft' })]))
    assert.ok(titlesFor.includes('Follow-up #1 drafted'))
    assert.equal(titlesFor.includes('Follow-up #1 scheduled'), false)
})

test('subsequent follow-ups appear in order, after the first one', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-2', follow_up_number: 2, status: 'scheduled', created_at: '2026-10-05T09:02:00.000Z', updated_at: '2026-10-05T09:02:00.000Z', due_at: '2026-10-12T09:00:00.000Z' }),
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'sent', created_at: '2026-09-28T10:20:00.000Z', sent_at: '2026-10-05T09:01:00.000Z', updated_at: '2026-10-05T09:01:00.000Z' }),
    ])
    const ordered = titles(events).filter((t) => t.startsWith('Follow-up'))
    assert.deepEqual(ordered, ['Follow-up #1 scheduled', 'Follow-up #1 sent', 'Follow-up #2 scheduled'])
})

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test('events are sorted by time, oldest first, whatever order the rows arrive in', () => {
    const events = buildApplicationTimeline(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'sent', sent_at: '2026-10-05T09:01:00.000Z', updated_at: '2026-10-05T09:01:00.000Z' }),
        email({ id: 'app-1', status: 'sent', created_at: '2026-09-28T10:01:00.000Z', sent_at: '2026-09-28T10:20:00.000Z' }),
    ])
    const times = events.map((e) => Date.parse(e.at))
    assert.deepEqual(times, [...times].sort((a, b) => a - b))
})

test('events with the same time keep a stable order', () => {
    const same = '2026-09-28T10:00:00.000Z'
    const a = buildApplicationTimeline({ ...job, analyzed_at: same }, [])
    const b = buildApplicationTimeline({ ...job, analyzed_at: same }, [])
    assert.deepEqual(a.map((e) => e.key), b.map((e) => e.key))
})

// ---------------------------------------------------------------------------
// Ownership and isolation
// ---------------------------------------------------------------------------

test('rows of another application are not shown in this timeline', () => {
    const events = buildApplicationTimeline(job, [
        email({ id: 'mine', status: 'sent', sent_at: '2026-09-28T10:20:00.000Z' }),
        email({ id: 'theirs-app', job_id: OTHER_JOB, status: 'sent', sent_at: '2026-09-29T10:20:00.000Z' }),
        followUp({ id: 'theirs-fu', job_id: OTHER_JOB, follow_up_number: 1, status: 'failed', error_code: 'EAUTH' }),
    ])
    assert.equal(events.filter((e) => e.title === 'Application sent').length, 1)
    assert.equal(events.some((e) => e.title.includes('failed')), false)
})

test('rows owned by another user are not shown, even if their job id matches', () => {
    const events = buildApplicationTimeline(job, [
        email({ id: 'intruder', user_id: OTHER_USER, status: 'sent', sent_at: '2026-09-28T10:20:00.000Z' }),
    ])
    assert.equal(events.some((e) => e.title === 'Application sent'), false)
})

test('the timeline never includes email text, recipients or subjects', () => {
    const secretBody = 'CONFIDENTIAL-BODY-TEXT'
    const events = buildApplicationTimeline(job, [
        Object.assign(email({ id: 'app-1', status: 'sent', sent_at: '2026-09-28T10:20:00.000Z' }), { body: secretBody, subject: 'CONFIDENTIAL-SUBJECT', to_email: 'secret@example.com' }),
    ])
    const serialised = JSON.stringify(events)
    assert.equal(serialised.includes(secretBody), false)
    assert.equal(serialised.includes('CONFIDENTIAL-SUBJECT'), false)
    assert.equal(serialised.includes('secret@example.com'), false)
})

test('the summary takes the next due follow-up and the latest state, only from this application', () => {
    const summary = followUpSummary(job, [
        followUp({ id: 'fu-1', follow_up_number: 1, status: 'sent' }),
        followUp({ id: 'fu-2', follow_up_number: 2, status: 'scheduled', due_at: '2026-10-12T09:00:00.000Z' }),
        followUp({ id: 'other', job_id: OTHER_JOB, follow_up_number: 1, status: 'scheduled', due_at: '2026-10-01T09:00:00.000Z' }),
        followUp({ id: 'intruder', user_id: OTHER_USER, follow_up_number: 3, status: 'scheduled', due_at: '2026-10-02T09:00:00.000Z' }),
    ])
    assert.deepEqual(summary.next, { number: 2, dueAt: '2026-10-12T09:00:00.000Z' })
    assert.deepEqual(summary.latest, { number: 2, status: 'scheduled' })
})

test('the summary reports no next follow-up when none is scheduled', () => {
    const summary = followUpSummary(job, [followUp({ id: 'fu-1', follow_up_number: 1, status: 'cancelled' })])
    assert.equal(summary.next, null)
    assert.deepEqual(summary.latest, { number: 1, status: 'cancelled' })
})

// ---------------------------------------------------------------------------
// Follow-up filters on the applications list
// ---------------------------------------------------------------------------

test('the follow-up filters pick only jobs with a follow-up in that state, for this user', () => {
    const rows = [
        { job_id: 'j1', user_id: USER, kind: 'follow_up', status: 'scheduled' },
        { job_id: 'j2', user_id: USER, kind: 'follow_up', status: 'failed' },
        { job_id: 'j3', user_id: USER, kind: 'follow_up', status: 'cancelled' },
        { job_id: 'j4', user_id: USER, kind: 'application', status: 'scheduled' },
        { job_id: 'j5', user_id: OTHER_USER, kind: 'follow_up', status: 'scheduled' },
    ]
    assert.deepEqual(jobIdsWithFollowUp(rows, USER, 'upcoming'), ['j1'])
    assert.deepEqual(jobIdsWithFollowUp(rows, USER, 'failed'), ['j2'])
    assert.deepEqual(jobIdsWithFollowUp(rows, USER, 'cancelled'), ['j3'])
})

test('a job with several matching follow-ups is listed once', () => {
    const rows = [
        { job_id: 'j1', user_id: USER, kind: 'follow_up', status: 'scheduled' },
        { job_id: 'j1', user_id: USER, kind: 'follow_up', status: 'scheduled' },
    ]
    assert.deepEqual(jobIdsWithFollowUp(rows, USER, 'upcoming'), ['j1'])
})

test('only the three known follow-up filters are accepted from the URL or the list', () => {
    assert.equal(isFollowUpFilter('upcoming'), true)
    assert.equal(isFollowUpFilter('failed'), true)
    assert.equal(isFollowUpFilter('cancelled'), true)
    assert.equal(isFollowUpFilter('everything'), false)
    assert.equal(isFollowUpFilter(undefined), false)
})
