// The job-details edit lock: recruiter_email becomes read-only once something has been sent,
// every other field stays editable regardless of status. Pure function, no database involved.

import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRecruiterEmailLock, canEditRecruiterEmail } from '../lib/jobs/editable'
import type { JobStatus } from '../lib/types/jobs'

const SENT_STATUSES: JobStatus[] = ['sent', 'follow_up_1', 'follow_up_2', 'replied', 'closed_no_response']
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
