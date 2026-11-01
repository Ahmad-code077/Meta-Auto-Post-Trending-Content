// Supabase store for the inbox sync. Runs with the service-role client, so every query filters by user_id.
// Each write is conditional, so two syncs cannot both record the same reply.

import type { SupabaseClient } from '@supabase/supabase-js';
import { withinReplyGraceWindow } from '@/lib/followups/policy';
import { logger, errorFields } from '@/lib/log/logger';
import { AWAITING_REPLY_STATUSES } from './match';
import type { InboxStore, RecordClassifiedReplyInput, RecordReplySeenInput } from './sync';
import type { OutboundEmail } from './match';
import { normalizeMessageId } from './headers';

const AUTO_CONFIRM_REASON = { error: 'Auto-confirmed 2 days before the follow-up was due.', error_code: 'AUTO_CONFIRMED_REPLY' };

export function createSupabaseInboxStore(supabase: SupabaseClient): InboxStore {
    return {
        async loadOutbound(since) {
            const { data, error } = await supabase
                .from('application_emails')
                .select('user_id, job_id, to_email, message_id, sent_at, jobs(status, title, company, last_inbound_message_id)')
                .eq('status', 'sent')
                .not('message_id', 'is', null)
                .gte('sent_at', since.toISOString());

            if (error) throw new Error(`Could not load sent emails: ${error.message}`);

            return (data ?? []).flatMap((row: Record<string, unknown>): OutboundEmail[] => {
                const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { status: string; title: string | null; company: string | null; last_inbound_message_id: string | null } | null;
                if (!job) return [];
                return [{
                    user_id: row.user_id as string,
                    job_id: row.job_id as string,
                    job_status: job.status,
                    job_title: job.title,
                    job_company: job.company,
                    job_last_inbound_message_id: job.last_inbound_message_id,
                    to_email: row.to_email as string,
                    message_id: normalizeMessageId(row.message_id as string),
                    sent_at: row.sent_at as string,
                }];
            });
        },

        // An engaged/rejected reply either goes to awaiting_review (the default -- a person decides)
        // or is auto-confirmed immediately when the job's one pending follow-up is already due soon
        // enough that waiting for review risks sending it over an unreviewed reply. Either way the
        // classification and reply_message_id are recorded in the same write, so there is one place
        // this decision is made, not a read here and a write in lib/inbox/sync.ts.
        async recordClassifiedReply(input: RecordClassifiedReplyInput) {
            const replyId = normalizeMessageId(input.replyMessageId);

            const { data: pending } = await supabase
                .from('application_emails')
                .select('id, due_at')
                .eq('user_id', input.userId)
                .eq('job_id', input.jobId)
                .eq('kind', 'follow_up')
                .eq('status', 'scheduled')
                .maybeSingle();

            const dueAt = pending?.due_at ? new Date(pending.due_at) : null;
            const autoConfirm = withinReplyGraceWindow(dueAt, input.now);

            const patch = autoConfirm
                ? {
                    status: 'replied',
                    replied_at: input.now.toISOString(),
                    reply_message_id: replyId,
                    reply_match: input.method,
                    reply_classification: input.classification,
                }
                : {
                    status: 'awaiting_review',
                    reply_message_id: replyId,
                    reply_match: input.method,
                    reply_classification: input.classification,
                };

            const { data, error } = await supabase
                .from('jobs')
                .update(patch)
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .in('status', [...AWAITING_REPLY_STATUSES])
                .select('id')
                .maybeSingle();

            if (error) throw new Error(`Could not record reply: ${error.message}`);

            if (data) {
                if (autoConfirm && pending) {
                    // The job is already recorded as replied, so the scheduler already refuses to send it
                    // regardless of whether this cancel succeeds -- a failure here is only tidying.
                    try {
                        await cancelFollowUpRow(supabase, pending.id, AUTO_CONFIRM_REASON);
                    } catch (error) {
                        logger.error('inbox.auto_confirm_cancel_failed', { job_id: input.jobId, ...errorFields(error) });
                    }
                }
                return autoConfirm ? 'auto_confirmed' : 'awaiting_review';
            }

            const { data: current } = await supabase
                .from('jobs')
                .select('reply_message_id')
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .maybeSingle();

            return current?.reply_message_id === replyId ? 'already' : 'ineligible';
        },

        // A reply that does not end the awaiting-reply period: only the classification and the dedup
        // cursor move. Status, replied_at, reply_message_id and follow-ups are left untouched, so the
        // scheduler keeps sending exactly as it would have if nothing had arrived.
        async recordReplySeen(input: RecordReplySeenInput) {
            const messageId = normalizeMessageId(input.messageId);
            const { data, error } = await supabase
                .from('jobs')
                .update({
                    last_inbound_message_id: messageId,
                    reply_classification: input.classification,
                })
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .in('status', [...AWAITING_REPLY_STATUSES])
                .select('id')
                .maybeSingle();

            if (error) throw new Error(`Could not record reply: ${error.message}`);
            if (data) return 'recorded';

            const { data: current } = await supabase
                .from('jobs')
                .select('last_inbound_message_id')
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .maybeSingle();

            return current?.last_inbound_message_id === messageId ? 'already' : 'ineligible';
        },
    };
}

// Cancels one specific follow-up row by id -- used only by recordClassifiedReply above, which already
// knows the exact row (there is at most one scheduled follow-up per job) rather than sweeping the job.
async function cancelFollowUpRow(
    supabase: SupabaseClient,
    followUpId: string,
    reason: { error: string; error_code: string }
): Promise<void> {
    const { error } = await supabase
        .from('application_emails')
        .update({
            status: 'cancelled',
            due_at: null,
            claim_token: null,
            error: reason.error,
            error_code: reason.error_code,
            updated_at: new Date().toISOString(),
        })
        .eq('id', followUpId)
        .eq('status', 'scheduled');

    if (error) throw new Error(`Could not cancel follow-up: ${error.message}`);
}
