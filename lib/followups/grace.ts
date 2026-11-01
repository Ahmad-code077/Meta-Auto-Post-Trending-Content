// Periodic sweep for jobs awaiting review: once an engaged/rejected reply hasn't been reviewed and
// its job's one pending follow-up is now due soon enough that waiting any longer risks sending it
// over an unreviewed reply, auto-confirm it (same outcome as if it had arrived that close already --
// see recordClassifiedReply in lib/inbox/store.ts). Run from the same cron trigger as the follow-up
// scheduler, before it, so an awaiting_review job is always resolved before its follow-up is due.

import { logger } from '@/lib/log/logger';
import { withinReplyGraceWindow } from './policy';

export interface PendingReview {
    userId: string;
    jobId: string;
    followUpId: string;
    dueAt: string;
}

export interface GraceStore {
    // Every job currently awaiting_review that still has a scheduled follow-up. The grace-window
    // comparison itself happens in runGraceWindowCheck, not in the query.
    listAwaitingReviewWithPendingFollowUp(): Promise<PendingReview[]>;
    // Returns false if the job is no longer awaiting_review (already resolved by a manual action or
    // another run) -- the row is simply skipped, not an error.
    autoConfirm(input: { userId: string; jobId: string; followUpId: string; now: Date }): Promise<boolean>;
}

export interface GraceSummary {
    checked: number;
    auto_confirmed: number;
    duration_ms: number;
}

export async function runGraceWindowCheck(store: GraceStore, now: Date): Promise<GraceSummary> {
    const started = Date.now();
    const pending = await store.listAwaitingReviewWithPendingFollowUp();
    let autoConfirmed = 0;

    for (const p of pending) {
        if (!withinReplyGraceWindow(new Date(p.dueAt), now)) continue;

        const confirmed = await store.autoConfirm({ userId: p.userId, jobId: p.jobId, followUpId: p.followUpId, now });
        if (confirmed) {
            autoConfirmed++;
            logger.info('followup.grace_auto_confirmed', { job_id: p.jobId, follow_up_id: p.followUpId });
        }
    }

    const summary: GraceSummary = { checked: pending.length, auto_confirmed: autoConfirmed, duration_ms: Date.now() - started };
    logger.info('followup.grace_check.end', { ...summary });
    return summary;
}
