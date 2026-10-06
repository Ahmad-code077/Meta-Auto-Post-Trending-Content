// Pure rules for scheduled follow-ups. No I/O, so every decision is deterministic and testable.

import { scrub } from '@/lib/log/logger';

export const FOLLOW_UP_DELAY_DAYS = 7;
export const MAX_ATTEMPTS = 3;
// Delay before the next attempt, indexed by the attempt that just failed (1 -> 15 min, 2 -> 60 min).
// There is no delay after the last attempt: the follow-up is marked failed instead.
export const RETRY_DELAYS_MINUTES = [15, 60, 240] as const;
// A processing row older than this has lost its worker. Its delivery state is unknown.
export const STALE_CLAIM_MINUTES = 20;

export type FailureStage = 'generate' | 'transmit';

export interface FailureDecision {
    retry: boolean;
    code: string;
    message: string;
}

// Thrown for failures that retrying cannot fix, such as a follow-up with no earlier sent email.
export class PermanentFollowUpError extends Error {
    readonly code: string;
    readonly permanent = true;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

// Generation failures are retried: nothing has been sent, so a retry is safe.
// SMTP failures are retried only when the connection never reached the message body (ECONNECTION, EDNS).
// Any other SMTP failure, including a timeout, may have been accepted by the server. Retrying could send twice,
// so those become failed, and a person decides whether to resend.
export function classifyFailure(error: unknown, stage: FailureStage): FailureDecision {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined;
    const message = scrub(error instanceof Error ? error.message : String(error));

    if ((error as { permanent?: boolean })?.permanent) {
        return { retry: false, code: code ?? 'PERMANENT', message };
    }

    if (stage === 'generate') {
        return { retry: true, code: code ?? 'GENERATION_FAILED', message };
    }

    if (code === 'ECONNECTION' || code === 'EDNS') {
        return { retry: true, code, message };
    }

    return { retry: false, code: code ?? 'SMTP_FAILED', message };
}

// When the next attempt may run, or null when attempts are exhausted.
export function nextAttemptAt(attemptsSoFar: number, now: Date): Date | null {
    if (attemptsSoFar >= MAX_ATTEMPTS) return null;
    const minutes = RETRY_DELAYS_MINUTES[attemptsSoFar - 1];
    return new Date(now.getTime() + minutes * 60_000);
}

export function followUpDueAt(sentAt: Date): Date {
    return new Date(sentAt.getTime() + FOLLOW_UP_DELAY_DAYS * 86_400_000);
}

export function isDue(due: { status: string; due_at: string | null }, now: Date): boolean {
    return due.status === 'scheduled' && due.due_at !== null && Date.parse(due.due_at) <= now.getTime();
}

export function isStaleClaim(claim: { status: string; claimed_at: string | null }, now: Date): boolean {
    if (claim.status !== 'processing' || !claim.claimed_at) return false;
    return now.getTime() - Date.parse(claim.claimed_at) > STALE_CLAIM_MINUTES * 60_000;
}

// A follow-up is still wanted only while the job is waiting for the reply that follow-up number asks about.
export function awaitingReply(jobStatus: string, followUpNumber: number): boolean {
    return followUpNumber === 1 ? jobStatus === 'sent' : jobStatus === 'follow_up_1';
}
