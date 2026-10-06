// Follow-up scheduler: the state machine that runs when the cron endpoint is triggered.
//
//   scheduled + due --claim--> processing --generate--> processing (content saved)
//                                         --transmit--> sent
//   on failure: scheduled (retry, if attempts remain) | failed
//   job no longer awaiting a reply: cancelled
//
// The cron route is only a trigger. All decisions are made here, and all I/O is injected through
// SchedulerDeps, so tests can run this exact logic against a fake store and fake transports.

import { logger, errorFields } from '@/lib/log/logger';
import type { Job } from '@/lib/types/jobs';
import { awaitingReply, classifyFailure, nextAttemptAt, type FailureDecision } from './policy';
import { isSendWindow, jitteredSendSlot, MAX_SENDS_PER_RUN, pacingMs } from './schedule';

export interface FollowUpRow {
    id: string;
    user_id: string;
    job_id: string;
    follow_up_number: number;
    status: string;
    due_at: string | null;
    attempts: number;
    to_email: string;
    in_reply_to: string | null;
    references_header: string | null;
    subject: string | null;
    body: string | null;
    claim_token: string | null;
    claimed_at: string | null;
}

export interface GeneratedFollowUp {
    subject: string;
    body: string;
    generation: Record<string, unknown>;
}

// Every state change is conditioned on the claim token, so a worker whose claim went stale can never
// overwrite the result of the worker that replaced it. Each method returns false when the condition no longer holds.
export interface FollowUpStore {
    listDue(now: Date, limit: number): Promise<FollowUpRow[]>;
    listStale(now: Date, limit: number): Promise<FollowUpRow[]>;
    claim(row: FollowUpRow, token: string, now: Date): Promise<FollowUpRow | null>;
    getJob(row: FollowUpRow): Promise<Job | null>;
    saveContent(row: FollowUpRow, token: string, content: GeneratedFollowUp): Promise<boolean>;
    markSent(row: FollowUpRow, token: string, messageId: string, sentAt: Date): Promise<boolean>;
    release(row: FollowUpRow, token: string, dueAt: Date, failure: FailureDecision): Promise<boolean>;
    fail(row: FollowUpRow, token: string, failure: FailureDecision): Promise<boolean>;
    cancel(row: FollowUpRow, token: string, code: string, message: string): Promise<boolean>;
    // Moves a scheduled, unclaimed follow-up to a new due time. Does not change its attempt count.
    moveDue(row: FollowUpRow, dueAt: Date): Promise<boolean>;
    failStale(row: FollowUpRow, now: Date): Promise<boolean>;
}

export interface SchedulerDeps {
    store: FollowUpStore;
    // Timezone of the send window. Checked before every send.
    zone: string;
    // Random source for send offsets and pacing. Injected so tests are deterministic.
    random(): number;
    // Waits between sends in one run. Injected so tests do not sleep.
    pause(ms: number): Promise<void>;
    generate(row: FollowUpRow, job: Job): Promise<GeneratedFollowUp>;
    transmit(row: FollowUpRow): Promise<string>;
    afterSent(row: FollowUpRow, job: Job, sentAt: Date, messageId: string): Promise<void>;
    now(): Date;
    newToken(): string;
}

export interface SchedulerSummary {
    due: number;
    claimed: number;
    sent: number;
    retry_scheduled: number;
    failed: number;
    cancelled: number;
    rescheduled: number;
    claims_lost: number;
    stale_recovered: number;
    duration_ms: number;
}

export async function runFollowUpScheduler(deps: SchedulerDeps, limit = 20): Promise<SchedulerSummary> {
    const started = Date.now();
    const summary: SchedulerSummary = {
        due: 0, claimed: 0, sent: 0, retry_scheduled: 0, failed: 0, cancelled: 0, rescheduled: 0, claims_lost: 0, stale_recovered: 0, duration_ms: 0,
    };

    logger.info('followup.scheduler.start', { limit });

    const now = deps.now();

    // A stale claim may have been sent. It is failed, never retried, so a person can check the sent folder.
    for (const stale of await deps.store.listStale(now, limit)) {
        if (await deps.store.failStale(stale, now)) {
            summary.stale_recovered++;
            logger.error('followup.failed', {
                follow_up_id: stale.id,
                job_id: stale.job_id,
                attempt: stale.attempts,
                error_code: 'STALE_CLAIM',
                error_message: 'Worker stopped before confirming delivery. Check the sent folder before resending.',
            });
        }
    }

    const due = await deps.store.listDue(now, limit);
    summary.due = due.length;
    logger.info('followup.discovered', { count: due.length });

    // Sequential on purpose. Between sends there is a random pause, and a run sends at most MAX_SENDS_PER_RUN.
    // Before each send the window is checked again, so a late run can never send outside it.
    for (const [index, row] of due.entries()) {
        if (index > 0) await deps.pause(pacingMs(deps.random));

        const current = deps.now();
        if (!isSendWindow(current, deps.zone) || summary.claimed >= MAX_SENDS_PER_RUN) {
            // Move to a later jittered slot inside the window. Outside the window, that is the next valid day.
            const next = jitteredSendSlot(current, deps.zone, deps.random);
            if (await deps.store.moveDue(row, next)) {
                summary.rescheduled++;
                logger.info('followup.rescheduled', { follow_up_id: row.id, job_id: row.job_id, reason: isSendWindow(current, deps.zone) ? 'run_limit' : 'outside_window' });
            }
            continue;
        }

        await processRow(deps, row, summary);
    }

    summary.duration_ms = Date.now() - started;
    logger.info('followup.scheduler.end', { ...summary });
    return summary;
}

async function processRow(deps: SchedulerDeps, row: FollowUpRow, summary: SchedulerSummary): Promise<void> {
    const token = deps.newToken();
    const now = deps.now();

    // Atomic claim. Two workers can list the same row. Only one claim matches.
    const claimed = await deps.store.claim(row, token, now);
    if (!claimed) {
        summary.claims_lost++;
        logger.info('followup.claim_lost', { follow_up_id: row.id, job_id: row.job_id });
        return;
    }
    summary.claimed++;

    const attempt = claimed.attempts;
    const ids = { follow_up_id: claimed.id, job_id: claimed.job_id, attempt };
    logger.info('followup.claimed', ids);

    const job = await deps.store.getJob(claimed);
    if (!job || !awaitingReply(job.status, claimed.follow_up_number)) {
        // Nothing is generated and nothing is sent. A recorded reply is the most common reason.
        const code = job?.status === 'replied' ? 'RECIPIENT_REPLIED' : 'JOB_NOT_AWAITING_REPLY';
        await deps.store.cancel(claimed, token, code, skipMessage(code));
        summary.cancelled++;
        logger.info('followup.skipped', { ...ids, reason: code });
        return;
    }

    const generateStarted = Date.now();
    logger.info('followup.generation.start', ids);
    let content: GeneratedFollowUp;
    try {
        content = await deps.generate(claimed, job);
    } catch (error) {
        const decision = classifyFailure(error, 'generate');
        logger.warn('followup.generation.failed', { ...ids, ...errorFields(error), duration_ms: Date.now() - generateStarted });
        await finishFailure(deps, claimed, token, decision, summary, attempt);
        return;
    }
    logger.info('followup.generation.success', { ...ids, duration_ms: Date.now() - generateStarted });

    if (!(await deps.store.saveContent(claimed, token, content))) {
        summary.claims_lost++;
        logger.warn('followup.claim_lost', { ...ids, stage: 'save_content' });
        return;
    }

    // A reply can be recorded while the text was being written. Check again right before the message leaves.
    // This narrows the window to the moment of the SMTP call. It cannot close it, because SMTP cannot be undone.
    const latest = await deps.store.getJob(claimed);
    if (!latest || !awaitingReply(latest.status, claimed.follow_up_number)) {
        const code = latest?.status === 'replied' ? 'RECIPIENT_REPLIED' : 'JOB_NOT_AWAITING_REPLY';
        await deps.store.cancel(claimed, token, code, skipMessage(code));
        summary.cancelled++;
        logger.info('followup.skipped', { ...ids, reason: code });
        return;
    }

    const written = { ...claimed, subject: content.subject, body: content.body };
    const sendStarted = Date.now();
    logger.info('followup.send.start', ids);
    let messageId: string;
    try {
        messageId = await deps.transmit(written);
    } catch (error) {
        const decision = classifyFailure(error, 'transmit');
        logger.error('followup.send.failed', { ...ids, ...errorFields(error), duration_ms: Date.now() - sendStarted });
        await finishFailure(deps, claimed, token, decision, summary, attempt);
        return;
    }

    // The message is out. Record it. If that write fails, the row stays processing and goes stale,
    // so it is never sent again. The message id is logged so the send can be traced.
    const sentAt = deps.now();
    logger.info('followup.send.success', { ...ids, message_id: messageId, duration_ms: Date.now() - sendStarted });

    if (!(await deps.store.markSent(claimed, token, messageId, sentAt))) {
        logger.error('followup.record_failed', { ...ids, message_id: messageId, error_code: 'RECORD_FAILED' });
        return;
    }

    try {
        await deps.afterSent(claimed, job, sentAt, messageId);
    } catch (error) {
        logger.error('followup.job_update_failed', { ...ids, ...errorFields(error) });
    }

    summary.sent++;
    logger.info('followup.sent', { ...ids, message_id: messageId });
}

async function finishFailure(
    deps: SchedulerDeps,
    row: FollowUpRow,
    token: string,
    decision: FailureDecision,
    summary: SchedulerSummary,
    attempt: number
): Promise<void> {
    const ids = { follow_up_id: row.id, job_id: row.job_id, attempt };
    const now = deps.now();
    const next = decision.retry ? nextAttemptAt(attempt, now) : null;

    if (next) {
        if (await deps.store.release(row, token, next, decision)) {
            summary.retry_scheduled++;
            logger.warn('followup.retry_scheduled', { ...ids, error_code: decision.code, error_message: decision.message, next_attempt_at: next.toISOString() });
        }
        return;
    }

    if (await deps.store.fail(row, token, decision)) {
        summary.failed++;
        logger.error('followup.failed', { ...ids, error_code: decision.code, error_message: decision.message });
    }
}

function skipMessage(code: string): string {
    return code === 'RECIPIENT_REPLIED'
        ? 'The recruiter replied, so this follow-up was not sent.'
        : 'The job no longer awaits this follow-up.';
}
