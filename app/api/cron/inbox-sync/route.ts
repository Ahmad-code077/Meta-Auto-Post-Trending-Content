// Trigger for the inbox sync. Vercel Cron calls it with the CRON_SECRET bearer token, and it can also be
// called by hand with the same token. Matching and state changes happen in lib/inbox.

import { isAuthorizedCronRequest } from '@/lib/auth/cron';
import { logger, errorFields } from '@/lib/log/logger';
import { createImapInboxProvider, readImapSettings, senderAddressFromEnv } from '@/lib/inbox/imap';
import { createSupabaseInboxStore } from '@/lib/inbox/store';
import { runInboxSync } from '@/lib/inbox/sync';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET) {
        logger.error('cron.not_configured', { route: 'inbox-sync', error_code: 'CRON_SECRET_MISSING' });
        return Response.json({ ok: false, error: 'Not configured' }, { status: 503 });
    }

    if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
        logger.warn('cron.unauthorized', { route: 'inbox-sync' });
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const summary = await runInboxSync({
            provider: createImapInboxProvider(readImapSettings()),
            store: createSupabaseInboxStore(createAdminClient()),
            selfAddress: senderAddressFromEnv(),
            now: () => new Date(),
        });
        return Response.json({ ok: true, ...summary });
    } catch (error) {
        logger.error('inbox.sync.crashed', errorFields(error));
        return Response.json({ ok: false, error: 'Inbox sync failed' }, { status: 500 });
    }
}
