// Deterministic matching of an inbound message to an application. No model, no network.
//
// Strongest first:
//   1. In-Reply-To names one of our sent Message-IDs
//   2. References names one of our sent Message-IDs
//   3. The sender is the recruiter address we wrote to, and there is exactly one such application
// A subject match is never enough to mark an application as replied. It is returned as "review" only.
// Anything ambiguous, automated, from ourselves, or sent before we wrote is ignored.

import { addressOf, extractMessageIds, normalizeMessageId } from './headers';

// Statuses in which a recruiter reply is meaningful and not yet recorded.
export const AWAITING_REPLY_STATUSES = ['sent', 'follow_up_1', 'follow_up_2'] as const;

export interface InboundMessage {
    messageId: string | null;
    inReplyTo: string | null;
    references: string | null;
    from: string | null;
    subject: string | null;
    date: string | null;       // ISO time from the Date header or the envelope
    automated: boolean;        // Auto-Submitted, bounces, and no-reply senders
}

// One sent email that could receive a reply. The job fields are only used for the weak subject fallback.
export interface OutboundEmail {
    user_id: string;
    job_id: string;
    job_status: string;
    job_title: string | null;
    job_company: string | null;
    to_email: string;
    message_id: string;
    sent_at: string;
}

export type MatchMethod = 'in_reply_to' | 'references' | 'sender';

export type MatchOutcome =
    | { kind: 'matched'; userId: string; jobId: string; method: MatchMethod }
    | { kind: 'review'; jobId: string; reason: 'subject_only' }
    | { kind: 'ignored'; reason: IgnoreReason };

export type IgnoreReason =
    | 'automated'
    | 'own_address'
    | 'no_message_id'
    | 'no_match'
    | 'ambiguous'
    | 'before_send'
    | 'not_awaiting';

export function matchInbound(
    message: InboundMessage,
    outbound: OutboundEmail[],
    selfAddress: string | null
): MatchOutcome {
    if (message.automated) return { kind: 'ignored', reason: 'automated' };

    const from = addressOf(message.from);
    if (selfAddress && from === selfAddress.toLowerCase()) return { kind: 'ignored', reason: 'own_address' };
    if (!message.messageId) return { kind: 'ignored', reason: 'no_message_id' };

    const received = message.date ? Date.parse(message.date) : Number.NaN;
    // A reply cannot come before the email it answers. An unknown date is allowed, but only header matches are trusted.
    const afterSend = (o: OutboundEmail) => Number.isNaN(received) || received >= Date.parse(o.sent_at);

    const byId = (ids: string[], method: MatchMethod): MatchOutcome | null => {
        const hits = outbound.filter((o) => ids.includes(normalizeMessageId(o.message_id)) && afterSend(o));
        if (hits.length === 0) return null;
        const jobs = new Set(hits.map((o) => `${o.user_id}:${o.job_id}`));
        if (jobs.size > 1) return { kind: 'ignored', reason: 'ambiguous' };
        const hit = hits[0];
        if (!isAwaiting(hit.job_status)) return { kind: 'ignored', reason: 'not_awaiting' };
        return { kind: 'matched', userId: hit.user_id, jobId: hit.job_id, method };
    };

    const replyHit = byId(extractMessageIds(message.inReplyTo), 'in_reply_to');
    if (replyHit) return replyHit;

    const referencesHit = byId(extractMessageIds(message.references), 'references');
    if (referencesHit) return referencesHit;

    if (from) {
        const senderHits = outbound.filter((o) => o.to_email.toLowerCase() === from && afterSend(o));
        const jobs = new Set(senderHits.map((o) => `${o.user_id}:${o.job_id}`));
        if (jobs.size > 1) return { kind: 'ignored', reason: 'ambiguous' };
        if (jobs.size === 1) {
            const hit = senderHits[0];
            if (!isAwaiting(hit.job_status)) return { kind: 'ignored', reason: 'not_awaiting' };
            return { kind: 'matched', userId: hit.user_id, jobId: hit.job_id, method: 'sender' };
        }
    }

    // Weak fallback: the subject names the company or role of one application. Never marks it as replied.
    const subject = (message.subject ?? '').toLowerCase();
    if (subject) {
        const subjectHits = outbound.filter((o) => afterSend(o) && isAwaiting(o.job_status) && namesIn(subject, o));
        const jobs = new Set(subjectHits.map((o) => `${o.user_id}:${o.job_id}`));
        if (jobs.size === 1) return { kind: 'review', jobId: subjectHits[0].job_id, reason: 'subject_only' };
    }

    return { kind: 'ignored', reason: 'no_match' };
}

function isAwaiting(status: string): boolean {
    return (AWAITING_REPLY_STATUSES as readonly string[]).includes(status);
}

// Only meaningful words count, so a short company name cannot match by accident.
function namesIn(subject: string, o: OutboundEmail): boolean {
    const candidates = [o.job_company, o.job_title]
        .map((v) => (v ?? '').trim().toLowerCase())
        .filter((v) => v.length >= 6);
    return candidates.some((name) => subject.includes(name));
}
