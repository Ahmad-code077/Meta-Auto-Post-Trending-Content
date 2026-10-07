// Application timeline, derived from records that already exist: the job row and its application_emails rows.
// Nothing is stored for the timeline itself, and no email body or raw error text is included in the output.
//
// Known limit: the database keeps only the latest change time for a row (updated_at). A reschedule is
// recognised as "a scheduled follow-up that was changed after it was created and has never run".
// A later change to the same row can hide an earlier one. This is shown on the review page, not hidden.

import { cancellationReason, failureReason } from '@/lib/followups/messages';

export type TimelineTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface TimelineEvent {
    key: string;
    at: string;
    title: string;
    detail: string | null;
    // Set when the event refers to a future time, such as the date a follow-up is due.
    dueAt: string | null;
    tone: TimelineTone;
}

export interface TimelineJob {
    id: string;
    user_id: string;
    created_at: string;
    analyzed_at: string | null;
    replied_at?: string | null;
}

export interface TimelineEmail {
    id: string;
    job_id: string;
    user_id: string;
    kind: 'application' | 'follow_up';
    follow_up_number: number | null;
    status: string;
    created_at: string;
    updated_at: string;
    sent_at: string | null;
    due_at: string | null;
    claimed_at: string | null;
    last_attempt_at: string | null;
    attempts: number | null;
    error_code: string | null;
    resume_id: string | null;
    generation: { edited_at?: string } | null;
}

const EDIT_TOLERANCE_MS = 5_000;

export function buildApplicationTimeline(job: TimelineJob, emails: TimelineEmail[]): TimelineEvent[] {
    const events: TimelineEvent[] = [
        {
            key: `job-created:${job.id}`,
            at: job.created_at,
            title: 'Job received',
            detail: null,
            dueAt: null,
            tone: 'neutral',
        },
    ];

    if (job.analyzed_at) {
        events.push({
            key: `job-analyzed:${job.id}`,
            at: job.analyzed_at,
            title: 'Job analysis completed',
            detail: 'Requirements were extracted from the posting.',
            dueAt: null,
            tone: 'neutral',
        });
    }

    if (job.replied_at) {
        events.push({
            key: `replied:${job.id}`,
            at: job.replied_at,
            title: 'Recruiter replied',
            detail: 'Detected in your mailbox. No further follow-ups will be sent.',
            dueAt: null,
            tone: 'success',
        });
    }

    // Only rows that belong to this job and this user. Anything else is ignored, even if it was passed in.
    for (const email of emails) {
        if (email.job_id !== job.id || email.user_id !== job.user_id) continue;
        events.push(...eventsForEmail(email));
    }

    return events
        .map((event, index) => ({ event, index }))
        .sort((a, b) => Date.parse(a.event.at) - Date.parse(b.event.at) || a.index - b.index)
        .map(({ event }) => event);
}

function eventsForEmail(email: TimelineEmail): TimelineEvent[] {
    if (email.kind === 'application') return applicationEvents(email);
    return followUpEvents(email);
}

function applicationEvents(email: TimelineEmail): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    if (email.status !== 'cancelled') {
        events.push({
            key: `draft:${email.id}`,
            at: email.created_at,
            title: 'Draft generated',
            detail: null,
            dueAt: null,
            tone: 'neutral',
        });
    }

    if (email.generation?.edited_at) {
        events.push({
            key: `edited:${email.id}`,
            at: email.generation.edited_at,
            title: 'Draft edited',
            detail: 'The text was changed before it was sent.',
            dueAt: null,
            tone: 'neutral',
        });
    }

    if (email.status === 'sent' && email.sent_at) {
        events.push({
            key: `sent:${email.id}`,
            at: email.sent_at,
            title: 'Application sent',
            detail: email.resume_id ? 'Your resume was attached.' : null,
            dueAt: null,
            tone: 'success',
        });
    }

    if (email.status === 'failed') {
        events.push({
            key: `send-failed:${email.id}`,
            at: email.updated_at,
            title: 'Sending failed',
            detail: 'The message was not accepted. You can try again from the draft.',
            dueAt: null,
            tone: 'danger',
        });
    }

    return events;
}

function followUpEvents(email: TimelineEmail): TimelineEvent[] {
    const n = email.follow_up_number ?? 0;
    const label = `Follow-up #${n}`;
    const attempts = email.attempts ?? 0;
    const events: TimelineEvent[] = [];

    if (email.status === 'draft') {
        events.push({ key: `fu-draft:${email.id}`, at: email.created_at, title: `${label} drafted`, detail: null, dueAt: null, tone: 'neutral' });
        return events;
    }

    events.push({
        key: `fu-scheduled:${email.id}`,
        at: email.created_at,
        title: `${label} scheduled`,
        detail: null,
        dueAt: null,
        tone: 'neutral',
    });

    if (email.status === 'scheduled') {
        if (attempts === 0 && Date.parse(email.updated_at) - Date.parse(email.created_at) > EDIT_TOLERANCE_MS) {
            events.push({
                key: `fu-rescheduled:${email.id}:${email.updated_at}`,
                at: email.updated_at,
                title: `${label} rescheduled`,
                detail: null,
                dueAt: email.due_at,
                tone: 'neutral',
            });
        }
        if (attempts > 0) {
            events.push({
                key: `fu-retry:${email.id}:${email.updated_at}`,
                at: email.updated_at,
                title: `${label} retry scheduled`,
                detail: `Attempt ${attempts} did not complete.`,
                dueAt: email.due_at,
                tone: 'warning',
            });
        }
    }

    if (email.status === 'processing' && email.claimed_at) {
        events.push({
            key: `fu-processing:${email.id}:${email.claimed_at}`,
            at: email.claimed_at,
            title: `${label} is being sent`,
            detail: attempts > 0 ? `Attempt ${attempts}.` : null,
            dueAt: null,
            tone: 'neutral',
        });
    }

    if (email.status === 'sent' && email.sent_at) {
        events.push({ key: `fu-sent:${email.id}`, at: email.sent_at, title: `${label} sent`, detail: null, dueAt: null, tone: 'success' });
    }

    if (email.status === 'failed') {
        events.push({
            key: `fu-failed:${email.id}`,
            at: email.last_attempt_at ?? email.updated_at,
            title: `${label} failed`,
            detail: `${failureReason(email.error_code)}${attempts > 0 ? ` Attempts: ${attempts}.` : ''}`,
            dueAt: null,
            tone: 'danger',
        });
    }

    if (email.status === 'cancelled' && email.error_code === 'RECIPIENT_REPLIED') {
        events.push({
            key: `fu-stopped:${email.id}`,
            at: email.updated_at,
            title: 'Pending follow-up cancelled',
            detail: `Follow-up #${n} was not sent because the recruiter replied.`,
            dueAt: null,
            tone: 'warning',
        });
    } else if (email.status === 'cancelled') {
        events.push({
            key: `fu-cancelled:${email.id}`,
            at: email.updated_at,
            title: `${label} cancelled`,
            detail: cancellationReason(email.error_code),
            dueAt: null,
            tone: 'warning',
        });
    }

    return events;
}

// Summary for the overview card: the next follow-up that will run, and the state of the most recent one.
export function followUpSummary(job: Pick<TimelineJob, 'id' | 'user_id'>, emails: TimelineEmail[]) {
    const mine = emails
        .filter((e) => e.kind === 'follow_up' && e.job_id === job.id && e.user_id === job.user_id && e.follow_up_number !== null)
        .sort((a, b) => (b.follow_up_number ?? 0) - (a.follow_up_number ?? 0));

    const upcoming = mine
        .filter((e) => e.status === 'scheduled' && e.due_at)
        .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];

    const latest = mine[0] ?? null;

    return {
        next: upcoming ? { number: upcoming.follow_up_number!, dueAt: upcoming.due_at! } : null,
        latest: latest ? { number: latest.follow_up_number!, status: latest.status } : null,
    };
}
