// The job-details edit lock: recruiter_email becomes read-only once something has been sent,
// every other field stays editable regardless of status. Pure function, no database involved.

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRecruiterEmailLock, canEditRecruiterEmail } from '../lib/jobs/editable'
import { revertStatusAfterKeepFollowingUp } from '../lib/jobs/reply-review'
import { gmailReplyLink } from '../lib/inbox/gmail-link'
import type { JobStatus } from '../lib/types/jobs'

const SENT_STATUSES: JobStatus[] = ['sent', 'follow_up_1', 'follow_up_2', 'awaiting_review', 'replied', 'closed_no_response']
const NOT_YET_SENT_STATUSES: JobStatus[] = ['new', 'draft_created']

test('recruiter email is editable before anything has been sent', () => {
    for (const status of NOT_YET_SENT_STATUSES) {
        assert.equal(canEditRecruiterEmail(status), true, status)
    }
})

test('recruiter email is locked once anything has been sent, whatever the exact status', () => {
    for (const status of SENT_STATUSES) {
        assert.equal(canEditRecruiterEmail(status), false, status)
    }
})

test('the lock drops only recruiter_email from the patch, after sending', () => {
    const patch = { title: 'New Title', recruiter_email: 'someone@example.com', location: 'Remote' }
    const result = applyRecruiterEmailLock('sent', patch)
    assert.deepEqual(result, { title: 'New Title', location: 'Remote' })
})

test('the lock changes nothing before sending', () => {
    const patch = { title: 'New Title', recruiter_email: 'someone@example.com' }
    const result = applyRecruiterEmailLock('draft_created', patch)
    assert.deepEqual(result, patch)
})

test('a patch that never touched recruiter_email is unaffected either way', () => {
    const patch = { title: 'New Title', location: 'Remote' }
    assert.deepEqual(applyRecruiterEmailLock('sent', patch), patch)
    assert.deepEqual(applyRecruiterEmailLock('draft_created', patch), patch)
})

// ---------------------------------------------------------------------------
// "Keep following up": which pre-reply status a job reverts to
// ---------------------------------------------------------------------------

test('revertStatusAfterKeepFollowingUp picks the stage matching how many follow-ups already sent', () => {
    assert.equal(revertStatusAfterKeepFollowingUp(0), 'sent')
    assert.equal(revertStatusAfterKeepFollowingUp(1), 'follow_up_1')
    assert.equal(revertStatusAfterKeepFollowingUp(2), 'follow_up_2')
    // Never expected in practice (follow-ups cap at 2), but should not throw or go out of range.
    assert.equal(revertStatusAfterKeepFollowingUp(3), 'follow_up_2')
})

// ---------------------------------------------------------------------------
// Gmail link, derived from reply_message_id at render time -- nothing is stored
// ---------------------------------------------------------------------------

test('gmailReplyLink searches by rfc822msgid, URL-encoding the message id including @ and +', () => {
    assert.equal(
        gmailReplyLink('abc+def@mail.gmail.com'),
        'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%2Bdef%40mail.gmail.com'
    )
})

test('gmailReplyLink strips surrounding <> brackets if still present', () => {
    assert.equal(
        gmailReplyLink('<abc@mail.gmail.com>'),
        'https://mail.google.com/mail/u/0/#search/rfc822msgid:abc%40mail.gmail.com'
    )
})

test('gmailReplyLink works the same whether or not brackets were already stripped', () => {
    assert.equal(gmailReplyLink('<id@x.com>'), gmailReplyLink('id@x.com'))
})
