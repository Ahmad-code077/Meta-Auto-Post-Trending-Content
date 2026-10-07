// Inbox sync: reads recent message headers, matches them to sent applications, and records replies.
//
// Invariant: once a reply is recorded on a job, the job is no longer awaiting a reply, so the scheduler and
// the manual follow-up actions refuse to send anything for it. The job status is the single source of truth.
//
// The sync is a trigger-driven batch (see app/api/cron/inbox-sync). It never reads message bodies.

import { logger, errorFields } from '@/lib/log/logger';
import { matchInbound, type InboundMessage, type MatchMethod, type OutboundEmail } from './match';
import { normalizeMessageId } from './headers';

export interface InboxProvider {
    // Headers only. Implementations must not mark messages as read or download their bodies.
    listRecent(since: Date): Promise<InboundMessage[]>;
}

export interface MarkRepliedInput {
    userId: string;
    jobId: string;
    replyMessageId: string;
    method: MatchMethod;
    repliedAt: Date;
}

export interface InboxStore {
    loadOutbound(since: Date): Promise<OutboundEmail[]>;
    // "marked": the job moved to replied now. "already": this same message was recorded before.
    // "ineligible": the job is not awaiting a reply.
    markReplied(input: MarkRepliedInput): Promise<'marked' | 'already' | 'ineligible'>;
    // Cancels scheduled follow-ups of the job. Processing and sent ones are not touched.
    cancelPendingFollowUps(userId: string, jobId: string): Promise<number>;
}

export interface InboxSyncDeps {
    provider: InboxProvider;
    store: InboxStore;
    selfAddress: string | null;
    now(): Date;
}

export interface InboxSyncSummary {
    scanned: number;
    matched: number;
    marked: number;
    already_recorded: number;
    ignored: number;
    review: number;
    follow_ups_cancelled: number;
    duration_ms: number;
}

const DEFAULT_WINDOW_DAYS = 30;

export async function runInboxSync(deps: InboxSyncDeps, windowDays = DEFAULT_WINDOW_DAYS): Promise<InboxSyncSummary> {
    const started = Date.now();
    const now = deps.now();
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const summary: InboxSyncSummary = {
        scanned: 0, matched: 0, marked: 0, already_recorded: 0, ignored: 0, review: 0, follow_ups_cancelled: 0, duration_ms: 0,
    };

    logger.info('inbox.sync.start', { window_days: windowDays });

    const outbound = await deps.store.loadOutbound(since);
    const messages = await deps.provider.listRecent(since);
    const seen = new Set<string>();

    // Traceable without content: how many candidates each side of the match had.
    logger.info('inbox.sync.loaded', { since: since.toISOString(), outbound_count: outbound.length, message_count: messages.length });

    // Oldest first, so a reply is recorded before any later message in the same run.
    const ordered = [...messages].sort((a, b) => (Date.parse(a.date ?? '') || 0) - (Date.parse(b.date ?? '') || 0));

    for (const message of ordered) {
        summary.scanned++;

        const id = message.messageId ? normalizeMessageId(message.messageId) : '';
        if (id && seen.has(id)) {
            summary.already_recorded++;
            continue;
        }
        if (id) seen.add(id);

        const outcome = matchInbound(message, outbound, deps.selfAddress);

        // One line per message: enough to see why a given reply did or did not match, without its content.
        logger.info('inbox.message.evaluated', {
            message_id: id || null,
            has_in_reply_to: Boolean(message.inReplyTo),
            has_references: Boolean(message.references),
            automated: message.automated,
            outcome: outcome.kind,
            method: outcome.kind === 'matched' ? outcome.method : null,
            reason: outcome.kind !== 'matched' ? outcome.reason : null,
            job_id: outcome.kind !== 'ignored' ? outcome.jobId : null,
        });

        if (outcome.kind === 'ignored') {
            summary.ignored++;
            continue;
        }

        if (outcome.kind === 'review') {
            // Recorded for a person to look at. The application is not changed.
            summary.review++;
            logger.info('inbox.review_needed', { job_id: outcome.jobId, reason: outcome.reason });
            continue;
        }

        summary.matched++;
        const result = await deps.store.markReplied({
            userId: outcome.userId,
            jobId: outcome.jobId,
            replyMessageId: id,
            method: outcome.method,
            repliedAt: message.date ? new Date(message.date) : now,
        });
        logger.info('inbox.mark_result', { job_id: outcome.jobId, result });

        if (result === 'already') {
            summary.already_recorded++;
            continue;
        }
        if (result === 'ineligible') {
            summary.ignored++;
            continue;
        }

        summary.marked++;
        logger.info('inbox.reply_detected', { job_id: outcome.jobId, method: outcome.method });

        try {
            const cancelled = await deps.store.cancelPendingFollowUps(outcome.userId, outcome.jobId);
            summary.follow_ups_cancelled += cancelled;
            logger.info('inbox.follow_ups_cancelled', { job_id: outcome.jobId, count: cancelled });
        } catch (error) {
            // The job is already marked replied, so the scheduler still refuses to send. The cancel is only tidying.
            logger.error('inbox.cancel_failed', { job_id: outcome.jobId, ...errorFields(error) });
        }
    }

    summary.duration_ms = Date.now() - started;
    logger.info('inbox.sync.end', { ...summary });
    return summary;
}
