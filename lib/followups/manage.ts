// User actions on scheduled follow-ups: cancel, reschedule, and retry a failed one.
//
// The decision (is this allowed, and what changes) is pure, so tests can check every transition.
// The write is a conditional update on the status the decision was based on. If the scheduler has
// claimed the row in the meantime, the update matches nothing and the action reports a conflict.
// Actions never touch a processing or sent follow-up, which is what keeps them from causing a duplicate send.

import type { SupabaseClient } from '@supabase/supabase-js';
import { awaitingReply } from './policy';
import { followUpTimeZone, isSendWindow, sendWindowLabel } from './schedule';

const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 365 * 86_400_000;

// Failures where nothing reached the recipient, so a manual retry cannot send a second copy.
// EAUTH is included because the SMTP settings are fixed and the same send is then tried again.
const SAFE_RETRY_CODES = new Set(['GENERATION_FAILED', 'VALIDATION_FAILED', 'ECONNECTION', 'EDNS', 'EAUTH']);

export function isSafeToRetry(errorCode: string | null): boolean {
    return errorCode !== null && SAFE_RETRY_CODES.has(errorCode);
}

export interface ManagedFollowUp {
    id: string;
    job_id: string;
    user_id: string;
    kind: string;
    follow_up_number: number | null;
    status: string;
    due_at: string | null;
    attempts: number;
    error_code: string | null;
}

export interface ManagedJob {
    id: string;
    user_id: string;
    status: string;
}

export type FollowUpAction =
    | { kind: 'cancel' }
    | { kind: 'reschedule'; dueAt: unknown }
    | { kind: 'retry'; dueAt: unknown };

export type ManageFailure = {
    ok: false;
    code: 'NOT_FOUND' | 'INVALID_STATE' | 'INVALID_TIME' | 'CONFLICT';
    message: string;
};

export type ManageSuccess = { ok: true; status: string; dueAt: string | null };

export interface UpdateSpec {
    expectedStatus: string;
    patch: Record<string, unknown>;
}

// Raised by the store when a second live follow-up would be created for the same number.
export class DuplicateFollowUpError extends Error {}

export interface ManageStore {
    getFollowUp(id: string, userId: string): Promise<ManagedFollowUp | null>;
    getJob(jobId: string, userId: string): Promise<ManagedJob | null>;
    updateIfStatus(id: string, userId: string, expectedStatus: string, patch: Record<string, unknown>): Promise<boolean>;
}

export function parseDueAt(value: unknown, now: Date, zone: string = followUpTimeZone()): { ok: true; date: Date } | ManageFailure {
    const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    if (Number.isNaN(time)) {
        return { ok: false, code: 'INVALID_TIME', message: 'Choose a valid date and time.' };
    }
    const lead = time - now.getTime();
    if (lead < MIN_LEAD_MS) {
        return { ok: false, code: 'INVALID_TIME', message: 'Choose a time at least one minute from now.' };
    }
    if (lead > MAX_LEAD_MS) {
        return { ok: false, code: 'INVALID_TIME', message: 'Choose a time within the next year.' };
    }
    if (!isSendWindow(new Date(time), zone)) {
        return { ok: false, code: 'INVALID_TIME', message: `Follow-ups are sent ${sendWindowLabel(zone)}. Choose a time in that window.` };
    }
    return { ok: true, date: new Date(time) };
}

// Only the state machine lives here. Ownership is checked in applyFollowUpAction.
export function decideFollowUpAction(
    row: ManagedFollowUp,
    job: ManagedJob,
    action: FollowUpAction,
    now: Date
): { ok: true; spec: UpdateSpec } | ManageFailure {
    if (row.kind !== 'follow_up' || row.follow_up_number === null) {
        return { ok: false, code: 'NOT_FOUND', message: 'Follow-up not found.' };
    }

    if (action.kind === 'cancel') {
        if (row.status !== 'scheduled') return invalidState(row);
        return {
            ok: true,
            spec: {
                expectedStatus: 'scheduled',
                patch: { status: 'cancelled', due_at: null, claim_token: null, error: 'Cancelled by the user', error_code: 'CANCELLED_BY_USER' },
            },
        };
    }

    if (action.kind === 'reschedule') {
        if (row.status !== 'scheduled') return invalidState(row);
        if (!awaitingReply(job.status, row.follow_up_number)) {
            return { ok: false, code: 'INVALID_STATE', message: 'The application no longer awaits a reply, so this follow-up cannot be moved.' };
        }
        const time = parseDueAt(action.dueAt, now);
        if (!time.ok) return time;
        return { ok: true, spec: { expectedStatus: 'scheduled', patch: { due_at: time.date.toISOString() } } };
    }

    // retry
    if (row.status !== 'failed') return invalidState(row);
    if (!isSafeToRetry(row.error_code)) {
        return { ok: false, code: 'INVALID_STATE', message: retryRefusal(row.error_code) };
    }
    if (!awaitingReply(job.status, row.follow_up_number)) {
        return { ok: false, code: 'INVALID_STATE', message: 'The application no longer awaits a reply, so this follow-up cannot be retried.' };
    }
    const time = parseDueAt(action.dueAt, now);
    if (!time.ok) return time;
    return {
        ok: true,
        spec: {
            expectedStatus: 'failed',
            // attempts are kept, so the record shows the full history.
            patch: { status: 'scheduled', due_at: time.date.toISOString(), claim_token: null, claimed_at: null, error: null, error_code: null },
        },
    };
}

export async function applyFollowUpAction(
    store: ManageStore,
    input: { userId: string; jobId: string; followUpId: string; action: FollowUpAction; now: Date }
): Promise<ManageSuccess | ManageFailure> {
    const { userId, jobId, followUpId, action, now } = input;

    // The same answer for "not yours" and "does not exist", so ids cannot be probed.
    const row = await store.getFollowUp(followUpId, userId);
    if (!row || row.job_id !== jobId) {
        return { ok: false, code: 'NOT_FOUND', message: 'Follow-up not found.' };
    }

    const job = await store.getJob(jobId, userId);
    if (!job || job.user_id !== userId) {
        return { ok: false, code: 'NOT_FOUND', message: 'Follow-up not found.' };
    }

    const decision = decideFollowUpAction(row, job, action, now);
    if (!decision.ok) return decision;

    let applied: boolean;
    try {
        applied = await store.updateIfStatus(followUpId, userId, decision.spec.expectedStatus, decision.spec.patch);
    } catch (error) {
        if (error instanceof DuplicateFollowUpError) {
            return { ok: false, code: 'CONFLICT', message: 'Another follow-up for this application is already scheduled.' };
        }
        throw error;
    }

    if (!applied) {
        return { ok: false, code: 'CONFLICT', message: 'This follow-up changed while you were looking at it. Reload to see its current status.' };
    }

    return {
        ok: true,
        status: String(decision.spec.patch.status ?? row.status),
        dueAt: (decision.spec.patch.due_at as string | null | undefined) ?? row.due_at,
    };
}

export function createSupabaseManageStore(supabase: SupabaseClient): ManageStore {
    return {
        async getFollowUp(id, userId) {
            const { data, error } = await supabase
                .from('application_emails')
                .select('id, job_id, user_id, kind, follow_up_number, status, due_at, attempts, error_code')
                .eq('id', id)
                .eq('user_id', userId)
                .eq('kind', 'follow_up')
                .maybeSingle();
            if (error) throw new Error(`Could not load follow-up: ${error.message}`);
            return (data as ManagedFollowUp | null) ?? null;
        },

        async getJob(jobId, userId) {
            const { data, error } = await supabase
                .from('jobs')
                .select('id, user_id, status')
                .eq('id', jobId)
                .eq('user_id', userId)
                .maybeSingle();
            if (error) throw new Error(`Could not load job: ${error.message}`);
            return (data as ManagedJob | null) ?? null;
        },

        async updateIfStatus(id, userId, expectedStatus, patch) {
            const { data, error } = await supabase
                .from('application_emails')
                .update({ ...patch, updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', userId)
                .eq('kind', 'follow_up')
                .eq('status', expectedStatus)
                .select('id')
                .maybeSingle();

            if (error) {
                // 23505 is the unique index that allows one live follow-up per job and number.
                if (error.code === '23505') throw new DuplicateFollowUpError(error.message);
                throw new Error(`Could not update follow-up: ${error.message}`);
            }
            return data !== null;
        },
    };
}

function invalidState(row: ManagedFollowUp): ManageFailure {
    const messages: Record<string, string> = {
        processing: 'This follow-up is being sent right now, so it cannot be changed.',
        sent: 'This follow-up has already been sent.',
        failed: 'This follow-up has failed. You can retry it instead.',
        cancelled: 'This follow-up was already cancelled.',
        scheduled: 'This follow-up cannot be changed right now.',
    };
    return { ok: false, code: 'INVALID_STATE', message: messages[row.status] ?? 'This follow-up cannot be changed right now.' };
}

function retryRefusal(errorCode: string | null): string {
    if (errorCode === 'EENVELOPE') return 'The recipient address was rejected. Retrying will not help.';
    if (errorCode === 'NO_PREVIOUS_SENT') return 'No earlier sent email exists for this job, so there is nothing to follow up on.';
    // Anything else may have reached the recipient. Retrying could send it twice.
    return 'The connection dropped while sending, so the email may have been delivered. Check your sent folder before resending.';
}
