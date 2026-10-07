// Guards for user-triggered generation: input validation, the user note, rate limiting and single-flight.
//
// Limitation: the rate limit and the in-flight lock live in this server process. On a platform that runs many
// instances, each instance has its own counters. Strict limits across instances need a shared store (for example
// a table or Redis). Until then these are per-instance protections, and the attempt cap still holds everywhere,
// because it is enforced inside each generation.

import { z } from 'zod';

export const NOTE_MAX_LENGTH = 300;

const UUID = z.string().uuid();

// Control characters are removed, runs of whitespace are collapsed, and the result is capped.
// Returns null for an empty note.
export function sanitizeUserNote(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const cleaned = value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned ? cleaned.slice(0, NOTE_MAX_LENGTH) : null;
}

export type GenerationInputResult =
    | { ok: true; jobId: string; note: string | null }
    | { ok: false; message: string };

// Validates what the browser sends before anything else runs. Ownership is checked later, in the database query.
export function parseGenerationInput(input: { jobId: unknown; note?: unknown }): GenerationInputResult {
    const id = UUID.safeParse(input.jobId);
    if (!id.success) return { ok: false, message: 'This application could not be found.' };
    if (typeof input.note === 'string' && input.note.length > 1000) {
        return { ok: false, message: `Notes must be ${NOTE_MAX_LENGTH} characters or fewer.` };
    }
    return { ok: true, jobId: id.data, note: sanitizeUserNote(input.note) };
}

// Pure check that a user is present. Server actions use requireUser, which throws when this is false.
export function isSignedIn(user: { id?: string | null } | null | undefined): user is { id: string } {
    return Boolean(user?.id);
}

export type Slot =
    | { ok: true; release: () => void }
    | { ok: false; reason: 'in_progress' | 'rate_limited'; message: string };

export interface GuardOptions {
    perMinute: number;
    perHour: number;
    now?: () => number;
}

// One guard per kind of generation. Each user may run one generation per job at a time, and a limited number per period.
export function createGenerationGuard(options: GuardOptions) {
    const now = options.now ?? (() => Date.now());
    const admitted = new Map<string, number[]>();
    const inFlight = new Set<string>();

    return {
        acquire(userId: string, jobId: string): Slot {
            const flightKey = `${userId}:${jobId}`;
            if (inFlight.has(flightKey)) {
                return { ok: false, reason: 'in_progress', message: 'A draft is already being written for this application. Wait for it to finish.' };
            }

            const current = now();
            const recent = (admitted.get(userId) ?? []).filter((t) => current - t < 3_600_000);
            admitted.set(userId, recent);

            const lastMinute = recent.filter((t) => current - t < 60_000).length;
            if (lastMinute >= options.perMinute || recent.length >= options.perHour) {
                return { ok: false, reason: 'rate_limited', message: 'You have written a lot of drafts in a short time. Wait a few minutes and try again.' };
            }

            recent.push(current);
            inFlight.add(flightKey);
            let released = false;
            return {
                ok: true,
                release: () => {
                    if (released) return;
                    released = true;
                    inFlight.delete(flightKey);
                },
            };
        },
    };
}

// The limits used by the server actions. Each click is a new generation, so these count clicks, not model calls.
export const draftGuard = createGenerationGuard({ perMinute: 3, perHour: 20 });
