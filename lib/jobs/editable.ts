// Which job fields can still be corrected by hand, and when. recruiter_email is the one exception:
// once something has been sent, the address actually used lives on that sent email
// (application_emails.to_email), not here, so editing this field afterward would just create a
// second, disagreeing record of who was emailed instead of changing anything real.

import type { JobStatus } from '@/lib/types/jobs';

const NOT_YET_SENT: JobStatus[] = ['new', 'draft_created'];

export function canEditRecruiterEmail(status: JobStatus): boolean {
    return NOT_YET_SENT.includes(status);
}

// Drops recruiter_email from a patch once the job is no longer editable for it. Every other field
// passes through unchanged -- this is the single place the rule is enforced server-side, so the
// UI disabling the field is a courtesy, not the actual guard.
export function applyRecruiterEmailLock<T extends Record<string, unknown>>(status: JobStatus, patch: T): T {
    if (canEditRecruiterEmail(status) || !('recruiter_email' in patch)) return patch;
    const rest = { ...patch };
    delete rest.recruiter_email;
    return rest;
}
