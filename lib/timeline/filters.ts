// Maps the "follow-up" filters on the applications list to follow-up statuses, and to the jobs that have one.

export type FollowUpFilter = 'upcoming' | 'failed' | 'cancelled';

export const FOLLOW_UP_FILTER_STATUS: Record<FollowUpFilter, string> = {
    upcoming: 'scheduled',
    failed: 'failed',
    cancelled: 'cancelled',
};

export function isFollowUpFilter(value: unknown): value is FollowUpFilter {
    return value === 'upcoming' || value === 'failed' || value === 'cancelled';
}

// Job ids that have at least one follow-up in the given state. Rows of other users are ignored.
export function jobIdsWithFollowUp(
    rows: { job_id: string; user_id: string; kind: string; status: string }[],
    userId: string,
    filter: FollowUpFilter
): string[] {
    const wanted = FOLLOW_UP_FILTER_STATUS[filter];
    const ids = new Set<string>();
    for (const row of rows) {
        if (row.user_id === userId && row.kind === 'follow_up' && row.status === wanted) ids.add(row.job_id);
    }
    return [...ids];
}
