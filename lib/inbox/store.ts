// Supabase store for the inbox sync. Runs with the service-role client, so every query filters by user_id.
// Each write is conditional, so two syncs cannot both record the same reply.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AWAITING_REPLY_STATUSES } from './match';
import type { InboxStore, MarkRepliedInput } from './sync';
import type { OutboundEmail } from './match';
import { normalizeMessageId } from './headers';

export function createSupabaseInboxStore(supabase: SupabaseClient): InboxStore {
    return {
        async loadOutbound(since) {
            const { data, error } = await supabase
                .from('application_emails')
                .select('user_id, job_id, to_email, message_id, sent_at, jobs(status, title, company)')
                .eq('status', 'sent')
                .not('message_id', 'is', null)
                .gte('sent_at', since.toISOString());

            if (error) throw new Error(`Could not load sent emails: ${error.message}`);

            return (data ?? []).flatMap((row: Record<string, unknown>): OutboundEmail[] => {
                const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { status: string; title: string | null; company: string | null } | null;
                if (!job) return [];
                return [{
                    user_id: row.user_id as string,
                    job_id: row.job_id as string,
                    job_status: job.status,
                    job_title: job.title,
                    job_company: job.company,
                    to_email: row.to_email as string,
                    message_id: normalizeMessageId(row.message_id as string),
                    sent_at: row.sent_at as string,
                }];
            });
        },

        // The job row is updated first. Once it is "replied", the scheduler refuses to send, even if the cancel below fails.
        async markReplied(input: MarkRepliedInput) {
            const replyId = normalizeMessageId(input.replyMessageId);
            const { data, error } = await supabase
                .from('jobs')
                .update({
                    status: 'replied',
                    replied_at: input.repliedAt.toISOString(),
                    reply_message_id: replyId,
                    reply_match: input.method,
                })
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .in('status', [...AWAITING_REPLY_STATUSES])
                .select('id')
                .maybeSingle();

            if (error) throw new Error(`Could not record reply: ${error.message}`);
            if (data) return 'marked';

            const { data: current } = await supabase
                .from('jobs')
                .select('reply_message_id')
                .eq('id', input.jobId)
                .eq('user_id', input.userId)
                .maybeSingle();

            return current?.reply_message_id === replyId ? 'already' : 'ineligible';
        },

        async cancelPendingFollowUps(userId, jobId) {
            const { data, error } = await supabase
                .from('application_emails')
                .update({
                    status: 'cancelled',
                    due_at: null,
                    claim_token: null,
                    error: 'The recruiter replied.',
                    error_code: 'RECIPIENT_REPLIED',
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId)
                .eq('job_id', jobId)
                .eq('kind', 'follow_up')
                .eq('status', 'scheduled')
                .select('id');

            if (error) throw new Error(`Could not cancel follow-ups: ${error.message}`);
            return (data ?? []).length;
        },
    };
}
