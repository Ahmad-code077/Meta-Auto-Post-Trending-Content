// Command center for applications: what needs attention, what is waiting, and what has replied.
//
// Everything here is derived from two record sets the page loads: the user's jobs and the user's
// application_emails rows. No new state is stored, and no status rule is restated. The awaiting statuses,
// the follow-up state machine and the retry rule are imported from the modules that already own them.
// The functions are pure, so every section and every next action is tested without a database.

import { AWAITING_REPLY_STATUSES } from '@/lib/inbox/match';
import { isSafeToRetry } from '@/lib/followups/manage';

export interface DashboardJob {
    id: string;
    user_id: string;
    title: string | null;
    company: string | null;
    recruiter_name: string | null;
    recruiter_email: string | null;
    status: string;
    created_at: string;
    sent_at: string | null;
    replied_at: string | null;
}

export interface DashboardEmail {
    id: string;
    job_id: string;
    user_id: string;
    kind: 'application' | 'follow_up';
    follow_up_number: number | null;
    status: string;
    due_at: string | null;
    sent_at: string | null;
    attempts: number | null;
    error_code: string | null;
    created_at: string;
}

// The one thing the user should do next for an application, derived from its current state.
export type NextAction =
    | { kind: 'create_draft'; attention: true }
    | { kind: 'review_draft'; attention: true }
    | { kind: 'resend'; attention: true }
    | { kind: 'retry_follow_up'; attention: true; followUpNumber: number }
    | { kind: 'check_sent_folder'; attention: true; followUpNumber: number }
    | { kind: 'follow_up_scheduled'; attention: false; followUpNumber: number; dueAt: string }
    | { kind: 'follow_up_sending'; attention: false; followUpNumber: number }
    | { kind: 'waiting_for_reply'; attention: false }
    | { kind: 'replied'; attention: false }
    | { kind: 'none'; attention: false };

export interface ApplicationCard {
    jobId: string;
    title: string | null;
    company: string | null;
    status: string;
    recruiterName: string | null;
    recruiterEmail: string | null;
    createdAt: string;
    sentAt: string | null;
    repliedAt: string | null;
    nextFollowUp: { number: number; dueAt: string } | null;
    nextAction: NextAction;
}

export interface UpcomingFollowUp {
    jobId: string;
    title: string | null;
    company: string | null;
    recruiterName: string | null;
    recruiterEmail: string | null;
    number: number;
    dueAt: string;
}

export interface CommandCenter {
    total: number;
    counts: { needsAttention: number; upcoming: number; waiting: number; replied: number };
    needsAttention: ApplicationCard[];
    upcomingFollowUps: UpcomingFollowUp[];
    waiting: ApplicationCard[];
    replied: ApplicationCard[];
    recent: ApplicationCard[];
    table: ApplicationCard[];
}

export const SECTION_LIMITS = { upcoming: 10, recent: 6, table: 50 } as const;

// Attention order: problems first, then drafts, then new work. Within a kind, the oldest application first.
const ATTENTION_ORDER: Record<NextAction['kind'], number> = {
    check_sent_folder: 0,
    retry_follow_up: 1,
    resend: 2,
    review_draft: 3,
    create_draft: 4,
    follow_up_scheduled: 9,
    follow_up_sending: 9,
    waiting_for_reply: 9,
    replied: 9,
    none: 9,
};

export function buildCommandCenter(input: {
    userId: string;
    jobs: DashboardJob[];
    emails: DashboardEmail[];
}): CommandCenter {
    // Defence in depth: rows that are not this user's are dropped, even though the queries already filter them.
    const jobs = input.jobs.filter((j) => j.user_id === input.userId);
    const emails = input.emails.filter((e) => e.user_id === input.userId);

    const emailsByJob = new Map<string, DashboardEmail[]>();
    for (const e of emails) {
        const list = emailsByJob.get(e.job_id) ?? [];
        list.push(e);
        emailsByJob.set(e.job_id, list);
    }

    const cards = jobs.map((job) => buildApplicationCard(job, emailsByJob.get(job.id) ?? []));

    const needsAttention = cards
        .filter((c) => c.nextAction.attention)
        .sort((a, b) => ATTENTION_ORDER[a.nextAction.kind] - ATTENTION_ORDER[b.nextAction.kind] || Date.parse(a.createdAt) - Date.parse(b.createdAt));

    const waiting = cards
        .filter((c) => isAwaiting(c.status) && !c.nextAction.attention)
        .sort((a, b) => Date.parse(a.sentAt ?? a.createdAt) - Date.parse(b.sentAt ?? b.createdAt));

    const replied = cards
        .filter((c) => c.status === 'replied')
        .sort((a, b) => Date.parse(b.repliedAt ?? b.createdAt) - Date.parse(a.repliedAt ?? a.createdAt));

    const upcomingFollowUps: UpcomingFollowUp[] = cards
        .filter((c) => isAwaiting(c.status) && c.nextFollowUp !== null)
        .map((c) => ({
            jobId: c.jobId,
            title: c.title,
            company: c.company,
            recruiterName: c.recruiterName,
            recruiterEmail: c.recruiterEmail,
            number: c.nextFollowUp!.number,
            dueAt: c.nextFollowUp!.dueAt,
        }))
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
        .slice(0, SECTION_LIMITS.upcoming);

    const byCreated = [...cards].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return {
        total: cards.length,
        counts: {
            needsAttention: needsAttention.length,
            upcoming: cards.filter((c) => isAwaiting(c.status) && c.nextFollowUp !== null).length,
            waiting: waiting.length,
            replied: replied.length,
        },
        needsAttention,
        upcomingFollowUps,
        waiting,
        replied,
        recent: byCreated.slice(0, SECTION_LIMITS.recent),
        table: byCreated.slice(0, SECTION_LIMITS.table),
    };
}

// The card for one application: its dates, its next follow-up and its next action. Shared by the dashboard and the list.
export function buildApplicationCard(job: DashboardJob, emails: DashboardEmail[]): ApplicationCard {
    const scheduled = emails
        .filter((e) => e.kind === 'follow_up' && e.status === 'scheduled' && e.due_at)
        .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];

    return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        status: job.status,
        recruiterName: job.recruiter_name,
        recruiterEmail: job.recruiter_email,
        createdAt: job.created_at,
        sentAt: job.sent_at ?? sentApplicationAt(emails),
        repliedAt: job.replied_at,
        nextFollowUp: scheduled ? { number: scheduled.follow_up_number!, dueAt: scheduled.due_at! } : null,
        nextAction: deriveNextAction(job, emails),
    };
}

// The next action for one application. Rules follow the real state machine:
//   new                      -> create a draft (the analysis runs as part of drafting)
//   draft_created            -> review the draft; a failed send is resent from the review page
//   awaiting a reply         -> a processing follow-up is being sent, a scheduled one is waiting, a failed one is
//                               retried only when retrying is safe, otherwise the sent folder is checked
//   replied                  -> nothing: follow-ups have stopped
//   closed_no_response       -> nothing
export function deriveNextAction(job: Pick<DashboardJob, 'status'>, emails: DashboardEmail[]): NextAction {
    if (job.status === 'replied') return { kind: 'replied', attention: false };
    if (job.status === 'closed_no_response') return { kind: 'none', attention: false };

    if (job.status === 'new') return { kind: 'create_draft', attention: true };

    if (job.status === 'draft_created') {
        const draft = latest(emails.filter((e) => e.kind === 'application' && ['draft', 'sending', 'failed'].includes(e.status)));
        if (draft?.status === 'failed') return { kind: 'resend', attention: true };
        if (draft) return { kind: 'review_draft', attention: true };
        return { kind: 'create_draft', attention: true };
    }

    if (isAwaiting(job.status)) {
        const followUps = emails.filter((e) => e.kind === 'follow_up' && e.follow_up_number !== null);

        const processing = followUps.find((e) => e.status === 'processing');
        if (processing) return { kind: 'follow_up_sending', attention: false, followUpNumber: processing.follow_up_number! };

        const scheduled = followUps
            .filter((e) => e.status === 'scheduled' && e.due_at)
            .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
        if (scheduled) {
            return { kind: 'follow_up_scheduled', attention: false, followUpNumber: scheduled.follow_up_number!, dueAt: scheduled.due_at! };
        }

        const failed = latest(followUps.filter((e) => e.status === 'failed'));
        if (failed) {
            return isSafeToRetry(failed.error_code)
                ? { kind: 'retry_follow_up', attention: true, followUpNumber: failed.follow_up_number! }
                : { kind: 'check_sent_folder', attention: true, followUpNumber: failed.follow_up_number! };
        }

        const manualDraft = latest(followUps.filter((e) => e.status === 'draft'));
        if (manualDraft) return { kind: 'review_draft', attention: true };

        return { kind: 'waiting_for_reply', attention: false };
    }

    return { kind: 'none', attention: false };
}

export function isAwaiting(status: string): boolean {
    return (AWAITING_REPLY_STATUSES as readonly string[]).includes(status);
}

function sentApplicationAt(emails: DashboardEmail[]): string | null {
    const sent = emails.find((e) => e.kind === 'application' && e.status === 'sent' && e.sent_at);
    return sent?.sent_at ?? null;
}

function latest<T extends { created_at: string }>(items: T[]): T | undefined {
    return [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}

// Short label for a next action. Used for the button or text in every section of the dashboard.
export function nextActionLabel(action: NextAction): string {
    switch (action.kind) {
        case 'create_draft': return 'Create draft';
        case 'review_draft': return 'Review draft';
        case 'resend': return 'Resend application';
        case 'retry_follow_up': return `Retry follow-up ${action.followUpNumber}`;
        case 'check_sent_folder': return `Check sent folder for follow-up ${action.followUpNumber}`;
        case 'follow_up_scheduled': return `Follow-up ${action.followUpNumber} scheduled`;
        case 'follow_up_sending': return `Sending follow-up ${action.followUpNumber}`;
        case 'waiting_for_reply': return 'Waiting for reply';
        case 'replied': return 'Recruiter replied';
        case 'none': return 'No action needed';
    }
}
