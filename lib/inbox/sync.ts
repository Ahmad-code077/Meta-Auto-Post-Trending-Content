// Inbox sync: reads recent message headers, matches them to sent applications, classifies the ones
// that match, and records the result.
//
// Invariant: an "engaged"/"rejected" reply moves the job to 'awaiting_review' for a person to decide
// (see app/actions/applications.ts markJobReplied/keepFollowingUp and lib/followups/grace.ts for the
// 2-day auto-confirm), unless the job's one pending follow-up is already due too soon to wait, in
// which case it is confirmed immediately. "holding" and "auto_reply" replies are recorded (for
// display) without ending the awaiting-reply period -- status is the single source of truth for
// whether follow-ups run.
//
// The sync is a trigger-driven batch (see app/api/cron/inbox-sync). It reads a message's body only
// after that message already matched a sent application by header, and only to classify it -- never
// for messages that didn't match.

import { logger } from '@/lib/log/logger';
import { matchInbound, type InboundMessage, type MatchMethod, type OutboundEmail } from './match';
import { normalizeMessageId } from './headers';
import { classifyReply, type ReplyClassification } from './classify-reply';

export interface InboxProvider {
    // Headers only. Implementations must not mark messages as read or download their bodies.
    listRecent(since: Date): Promise<InboundMessage[]>;
    // Fetches and decodes one message's body by UID, called only for messages that already matched
    // a sent application. Returns null when the body cannot be read. Implementations must still not
    // mark the message as read (BODY.PEEK, same guarantee as listRecent -- see lib/inbox/imap.ts).
    fetchBody(uid: number): Promise<string | null>;
}

export interface RecordClassifiedReplyInput {
    userId: string;
    jobId: string;
    replyMessageId: string;
    method: MatchMethod;
    classification: 'engaged' | 'rejected';
    now: Date;
}

export interface RecordReplySeenInput {
    userId: string;
    jobId: string;
    messageId: string;
    classification: ReplyClassification;
}

export interface InboxStore {
    loadOutbound(since: Date): Promise<OutboundEmail[]>;
    // "awaiting_review": recorded, a person decides next (the default). "auto_confirmed": the job's
    // one pending follow-up was already due soon enough that review was skipped and the follow-up was
    // cancelled immediately. "already": this same message was recorded before. "ineligible": the job
    // is not awaiting a reply.
    recordClassifiedReply(input: RecordClassifiedReplyInput): Promise<'awaiting_review' | 'auto_confirmed' | 'already' | 'ineligible'>;
    // A reply that does not end the awaiting-reply period (holding/auto_reply): status, replied_at
    // and follow-ups are left untouched. Only the classification and the dedup cursor move, so the
    // same message is not reclassified on a later sync run.
    recordReplySeen(input: RecordReplySeenInput): Promise<'recorded' | 'already' | 'ineligible'>;
}

export interface InboxSyncDeps {
    provider: InboxProvider;
    store: InboxStore;
    selfAddress: string | null;
    now(): Date;
    // Classifies a reply body. Injectable for tests; defaults to the real model call.
    classify?: (body: string) => Promise<ReplyClassification>;
}

export interface InboxSyncSummary {
    scanned: number;
    matched: number;
    awaiting_review: number;   // engaged/rejected, recorded for review; status untouched
    marked: number;             // engaged/rejected, auto-confirmed immediately: status -> 'replied'
    seen: number;                // recorded as holding or auto_reply; status left as-is
    already_recorded: number;
    ignored: number;
    review: number;
    follow_ups_cancelled: number;
    duration_ms: number;
}

const DEFAULT_WINDOW_DAYS = 30;

export async function runInboxSync(deps: InboxSyncDeps, windowDays = DEFAULT_WINDOW_DAYS): Promise<InboxSyncSummary> {
    const started = Date.now();
    const classify = deps.classify ?? classifyReply;
    const now = deps.now();
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const summary: InboxSyncSummary = {
        scanned: 0, matched: 0, awaiting_review: 0, marked: 0, seen: 0, already_recorded: 0, ignored: 0, review: 0, follow_ups_cancelled: 0, duration_ms: 0,
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

        // Dedup for replies that never flip the job's status (holding/auto_reply): markReplied's own
        // dedup only works once status actually changes, so this is the only guard for those, and it
        // has to run before classifying to avoid re-billing the same message to the model every run.
        const matchedOutbound = outbound.find((o) => o.job_id === outcome.jobId && o.user_id === outcome.userId);
        if (matchedOutbound?.job_last_inbound_message_id === id) {
            summary.already_recorded++;
            continue;
        }

        const body = await deps.provider.fetchBody(message.uid);
        const classification = await classify(body ?? '');
        logger.info('inbox.reply_classified', { job_id: outcome.jobId, classification, body_read: body !== null });

        if (classification === 'engaged' || classification === 'rejected') {
            const result = await deps.store.recordClassifiedReply({
                userId: outcome.userId,
                jobId: outcome.jobId,
                replyMessageId: id,
                method: outcome.method,
                classification,
                now,
            });
            logger.info('inbox.classified_reply_result', { job_id: outcome.jobId, method: outcome.method, classification, result });

            if (result === 'already') {
                summary.already_recorded++;
                continue;
            }
            if (result === 'ineligible') {
                summary.ignored++;
                continue;
            }

            if (result === 'auto_confirmed') {
                summary.marked++;
                summary.follow_ups_cancelled++;
                logger.info('inbox.reply_auto_confirmed', { job_id: outcome.jobId, method: outcome.method, classification });
            } else {
                summary.awaiting_review++;
                logger.info('inbox.reply_awaiting_review', { job_id: outcome.jobId, method: outcome.method, classification });
            }
            continue;
        }

        // holding / auto_reply: a real reply was seen, but it does not end the awaiting-reply period.
        // Follow-ups keep running -- job status, replied_at and reply_message_id are untouched.
        const seenResult = await deps.store.recordReplySeen({
            userId: outcome.userId,
            jobId: outcome.jobId,
            messageId: id,
            classification,
        });
        logger.info('inbox.reply_seen', { job_id: outcome.jobId, classification, result: seenResult });

        if (seenResult === 'recorded') summary.seen++;
        else summary.already_recorded++;
    }

    summary.duration_ms = Date.now() - started;
    logger.info('inbox.sync.end', { ...summary });
    return summary;
}
