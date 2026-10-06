import { timingSafeEqual } from 'node:crypto';

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set on the project.
// An unset secret never authorizes a request.
export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
    if (!secret || !authorization) return false;

    const provided = Buffer.from(authorization);
    const expected = Buffer.from(`Bearer ${secret}`);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}
