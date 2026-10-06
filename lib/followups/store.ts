// Supabase implementation of FollowUpStore. Each state change is a single conditional UPDATE, so the
// database decides the outcome when two workers race. Nothing here relies on in-process memory.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job } from '@/lib/types/jobs';
import { STALE_CLAIM_MINUTES } from './policy';
import type { FollowUpRow, FollowUpStore, GeneratedFollowUp } from './scheduler';
import type { FailureDecision } from './policy';

const ROW_COLUMNS = 'id, user_id, job_id, follow_up_number, status, due_at, attempts, to_email, in_reply_to, references_header, subject, body, claim_token, claimed_at';

export function createSupabaseFollowUpStore(supabase: SupabaseClient): FollowUpStore {
    // Writes only succeed while this worker still holds the claim. Returns false when it no longer does.
    const fenced = async (
        id: string,
        token: string,
        patch: Record<string, unknown>
    ): Promise<boolean> => {
        const { data, error } = await supabase
            .from('application_emails')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('claim_token', token)
            .eq('status', 'processing')
            .select('id')
            .maybeSingle();

        if (error) throw new Error(`Could not update follow-up: ${error.message}`);
        return data !== null;
    };

    return {
        async listDue(now, limit) {
            const { data, error } = await supabase
                .from('application_emails')
                .select(ROW_COLUMNS)
                .eq('kind', 'follow_up')
                .eq('status', 'scheduled')
                .lte('due_at', now.toISOString())
                .order('due_at', { ascending: true })
                .limit(limit);

            if (error) throw new Error(`Could not list due follow-ups: ${error.message}`);
            return (data ?? []) as FollowUpRow[];
        },

        async listStale(now, limit) {
            const cutoff = new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000).toISOString();
            const { data, error } = await supabase
                .from('application_emails')
                .select(ROW_COLUMNS)
                .eq('kind', 'follow_up')
                .eq('status', 'processing')
                .lt('claimed_at', cutoff)
                .limit(limit);

            if (error) throw new Error(`Could not list stale claims: ${error.message}`);
            return (data ?? []) as FollowUpRow[];
        },

        // The claim matches only if the row is still scheduled, due, and has the attempt count we read.
        // If another worker claimed it first, or the row was released and re-read with an older count, no row
        // matches and this returns null.
        async claim(row, token, now) {
            const { data, error } = await supabase
                .from('application_emails')
                .update({
                    status: 'processing',
                    claim_token: token,
                    claimed_at: now.toISOString(),
                    last_attempt_at: now.toISOString(),
                    attempts: row.attempts + 1,
                    error: null,
                    error_code: null,
                    updated_at: now.toISOString(),
                })
                .eq('id', row.id)
                .eq('status', 'scheduled')
                .eq('attempts', row.attempts)
                .lte('due_at', now.toISOString())
                .select(ROW_COLUMNS)
                .maybeSingle();

            if (error) throw new Error(`Could not claim follow-up: ${error.message}`);
            return (data as FollowUpRow | null) ?? null;
        },

        async getJob(row) {
            const { data, error } = await supabase
                .from('jobs')
                .select('*')
                .eq('id', row.job_id)
                .eq('user_id', row.user_id)
                .maybeSingle();

            if (error) throw new Error(`Could not load job: ${error.message}`);
            return (data as Job | null) ?? null;
        },

        saveContent(row, token, content: GeneratedFollowUp) {
            return fenced(row.id, token, { subject: content.subject, body: content.body, generation: content.generation });
        },

        markSent(row, token, messageId, sentAt) {
            return fenced(row.id, token, {
                status: 'sent',
                sent_at: sentAt.toISOString(),
                message_id: messageId,
                due_at: null,
                claim_token: null,
                claimed_at: null,
                error: null,
                error_code: null,
            });
        },

        release(row, token, dueAt, failure: FailureDecision) {
            return fenced(row.id, token, {
                status: 'scheduled',
                due_at: dueAt.toISOString(),
                claim_token: null,
                claimed_at: null,
                error: failure.message,
                error_code: failure.code,
            });
        },

        fail(row, token, failure: FailureDecision) {
            return fenced(row.id, token, {
                status: 'failed',
                due_at: null,
                claim_token: null,
                error: failure.message,
                error_code: failure.code,
            });
        },

        cancel(row, token, code, message) {
            return fenced(row.id, token, {
                status: 'cancelled',
                due_at: null,
                claim_token: null,
                error: message,
                error_code: code,
            });
        },

        // Stale rows are failed only if they still carry the claim we read, so a worker that finished in
        // the meantime is not overwritten.
        async failStale(row, now) {
            const { data, error } = await supabase
                .from('application_emails')
                .update({
                    status: 'failed',
                    claim_token: null,
                    error: 'Worker stopped before confirming delivery. Check the sent folder before resending.',
                    error_code: 'STALE_CLAIM',
                    updated_at: now.toISOString(),
                })
                .eq('id', row.id)
                .eq('status', 'processing')
                .eq('claim_token', row.claim_token ?? '')
                .select('id')
                .maybeSingle();

            if (error) throw new Error(`Could not fail stale claim: ${error.message}`);
            return data !== null;
        },
    };
}
