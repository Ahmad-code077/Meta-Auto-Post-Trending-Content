// Production wiring for the scheduler. Connects it to the real store, the existing follow-up generator,
// and the existing SMTP transport. Nothing new is implemented here.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateFollowUpContent } from '@/lib/harness/application';
import { advanceJobAfterSend, transmitEmail } from '@/lib/mail/send';
import { createSupabaseFollowUpStore } from './store';
import type { SchedulerDeps } from './scheduler';

export function createFollowUpDeps(supabase: SupabaseClient): SchedulerDeps {
    return {
        store: createSupabaseFollowUpStore(supabase),
        now: () => new Date(),
        newToken: () => randomUUID(),

        async generate(row, job) {
            const content = await generateFollowUpContent(supabase, row.user_id, job, row.follow_up_number);
            return {
                subject: content.subject,
                body: content.body,
                generation: content.generation as unknown as Record<string, unknown>,
            };
        },

        transmit(row) {
            return transmitEmail(
                supabase,
                row.user_id,
                {
                    id: row.id,
                    to_email: row.to_email,
                    subject: row.subject ?? '',
                    body: row.body ?? '',
                    in_reply_to: row.in_reply_to,
                    references_header: row.references_header,
                },
                null
            );
        },

        async afterSent(row, job, sentAt, messageId) {
            await advanceJobAfterSend(
                supabase,
                row.user_id,
                job,
                {
                    id: row.id,
                    kind: 'follow_up',
                    follow_up_number: row.follow_up_number,
                    to_email: row.to_email,
                    references_header: row.references_header,
                },
                sentAt,
                messageId
            );
        },
    };
}
