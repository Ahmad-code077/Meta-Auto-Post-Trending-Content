// Sends application drafts that the user chose to queue for the next business-hours window,
// instead of sending immediately. The content is already written and approved -- this only waits
// for the window and then calls the same sendApplicationEmail() used for an immediate send.
//
//   scheduled + due + in window --> sendApplicationEmail() (claim, transmit, record, advance job)
//   scheduled + due + outside window, or run already full --> due_at moved to the next jittered slot
//
// Unlike the follow-up scheduler, there is no generate step and no multi-day retry/backoff: a send
// failure here is recorded as "failed" by sendApplicationEmail itself, same as a failed manual send,
// and the user retries by hand from the draft review page.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger, errorFields } from '@/lib/log/logger';
import { isSendWindow, jitteredSendSlot, MAX_SENDS_PER_RUN, pacingMs } from '@/lib/followups/schedule';
import { sendApplicationEmail } from './send';

export interface DueApplicationSend {
    id: string;
    user_id: string;
    due_at: string;
}

export interface SendSchedulerStore {
    listDue(now: Date, limit: number): Promise<DueApplicationSend[]>;
    // Moves a scheduled, un-sent row to a new due time. False if it was no longer scheduled (e.g. cancelled).
    reschedule(id: string, dueAt: Date): Promise<boolean>;
    send(userId: string, id: string): Promise<void>;
}

export interface SendSchedulerDeps {
    store: SendSchedulerStore;
    zone: string;
    random(): number;
    pause(ms: number): Promise<void>;
    now(): Date;
}

export interface SendSchedulerSummary {
    due: number;
    sent: number;
    rescheduled: number;
    failed: number;
    duration_ms: number;
}

export async function runScheduledApplicationSends(deps: SendSchedulerDeps, limit = 20): Promise<SendSchedulerSummary> {
    const started = Date.now();
    const summary: SendSchedulerSummary = { due: 0, sent: 0, rescheduled: 0, failed: 0, duration_ms: 0 };

    const due = await deps.store.listDue(deps.now(), limit);
    summary.due = due.length;
    logger.info('application_send.discovered', { count: due.length });

    for (const [index, row] of due.entries()) {
        if (index > 0) await deps.pause(pacingMs(deps.random));

        const current = deps.now();
        if (!isSendWindow(current, deps.zone) || summary.sent >= MAX_SENDS_PER_RUN) {
            const next = jitteredSendSlot(current, deps.zone, deps.random);
            if (await deps.store.reschedule(row.id, next)) {
                summary.rescheduled++;
                logger.info('application_send.rescheduled', {
                    email_id: row.id,
                    due_at: next.toISOString(),
                    reason: isSendWindow(current, deps.zone) ? 'run_limit' : 'outside_window',
                });
            }
            continue;
        }

        try {
            await deps.store.send(row.user_id, row.id);
            summary.sent++;
            logger.info('application_send.sent', { email_id: row.id });
        } catch (error) {
            summary.failed++;
            logger.error('application_send.failed', { email_id: row.id, ...errorFields(error) });
        }
    }

    summary.duration_ms = Date.now() - started;
    logger.info('application_send.scheduler.end', { ...summary });
    return summary;
}

export function createSupabaseSendSchedulerStore(supabase: SupabaseClient): SendSchedulerStore {
    return {
        async listDue(now, limit) {
            const { data, error } = await supabase
                .from('application_emails')
                .select('id, user_id, due_at')
                .eq('kind', 'application')
                .eq('status', 'scheduled')
                .lte('due_at', now.toISOString())
                .order('due_at', { ascending: true })
                .limit(limit);

            if (error) {
                logger.error('application_send.list_failed', errorFields(error));
                return [];
            }
            return (data ?? []) as DueApplicationSend[];
        },

        async reschedule(id, dueAt) {
            const { data, error } = await supabase
                .from('application_emails')
                .update({ due_at: dueAt.toISOString(), updated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('status', 'scheduled')
                .select('id')
                .maybeSingle();

            if (error) {
                logger.error('application_send.reschedule_failed', { email_id: id, ...errorFields(error) });
                return false;
            }
            return Boolean(data);
        },

        async send(userId, id) {
            await sendApplicationEmail(supabase, userId, id);
        },
    };
}
