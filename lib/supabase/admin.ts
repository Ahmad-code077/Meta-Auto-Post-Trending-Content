import { createClient } from '@supabase/supabase-js';

// Service-role client for background work with no user session (the cron scheduler).
// It bypasses row level security, so every query must still filter by user_id and job_id.
// Never import this module from client components.
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Supabase admin client is not configured');
    }
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
