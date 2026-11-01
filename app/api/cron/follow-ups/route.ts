// Trigger for the follow-up scheduler. Vercel Cron calls this route with the CRON_SECRET bearer token.
// The route only authenticates and reports. Deciding what is due, claiming, generating and sending all happen
// in lib/followups.

import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { logger, errorFields } from '@/lib/log/logger';
import { createFollowUpDeps } from '@/lib/followups/deps';
import { runFollowUpScheduler } from '@/lib/followups/scheduler';
import { runGraceWindowCheck } from '@/lib/followups/grace';
import { createSupabaseGraceStore } from '@/lib/followups/store';
import { followUpTimeZone } from '@/lib/followups/schedule';
import { runScheduledApplicationSends, createSupabaseSendSchedulerStore } from '@/lib/mail/send-scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
// The run paces its sends with pauses of up to 20 seconds, so it needs more than the default time.
export const maxDuration = 300;

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET) {
        logger.error('cron.not_configured', { route: 'follow-ups', error_code: 'CRON_SECRET_MISSING' });
        return Response.json({ ok: false, error: 'Not configured' }, { status: 503 });
    }

    if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
        logger.warn('cron.unauthorized', { route: 'follow-ups' });
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createAdminClient();

        // Resolves any job awaiting review whose follow-up is now due soon, before the scheduler below
        // ever sees it -- so a follow-up is never sent over a reply nobody has looked at.
        const grace = await runGraceWindowCheck(createSupabaseGraceStore(supabase), new Date());

        const applicationSends = await runScheduledApplicationSends({
            store: createSupabaseSendSchedulerStore(supabase),
            zone: followUpTimeZone(),
            random: () => Math.random(),
            pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            now: () => new Date(),
        });

        const summary = await runFollowUpScheduler(createFollowUpDeps(supabase));
        return Response.json({ ok: true, grace, applicationSends, ...summary });
    } catch (error) {
        logger.error('followup.scheduler.crashed', errorFields(error));
        return Response.json({ ok: false, error: 'Scheduler failed' }, { status: 500 });
    }
}
