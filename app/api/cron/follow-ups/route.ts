// Trigger for the follow-up scheduler. Vercel Cron calls this route with the CRON_SECRET bearer token.
// The route only authenticates and reports. Deciding what is due, claiming, generating and sending all happen
// in lib/followups.

import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { logger, errorFields } from '@/lib/log/logger';
import { createFollowUpDeps } from '@/lib/followups/deps';
import { runFollowUpScheduler } from '@/lib/followups/scheduler';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

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
        const summary = await runFollowUpScheduler(createFollowUpDeps(createAdminClient()));
        return Response.json({ ok: true, ...summary });
    } catch (error) {
        logger.error('followup.scheduler.crashed', errorFields(error));
        return Response.json({ ok: false, error: 'Scheduler failed' }, { status: 500 });
    }
}
