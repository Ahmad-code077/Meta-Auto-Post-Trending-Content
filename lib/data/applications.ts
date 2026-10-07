// Server-side data access for the applications list. Each request runs a fixed number of queries, whatever
// the page size. Every query is scoped to the user, and rows that are not the user's are dropped in code as well.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildApplicationCard, type ApplicationCard, type DashboardEmail } from '@/lib/dashboard/command-center';
import {
    compareNextFollowUp,
    PAGE_SIZE,
    pageWindow,
    STATUS_DEFINITIONS,
    type ListQuery,
    type StatusFilter,
    type SortKey,
} from '@/lib/applications/list';
import { jobIdsWithFollowUp, type FollowUpFilter } from '@/lib/timeline/filters';
import type { Job } from '@/lib/types/jobs';

// Limit for id-only lookups. Beyond this, the follow-up and sort results are truncated and the list says so.
const LIGHT_LIMIT = 1000;
const OPTION_LIMIT = 5000;

const FOLLOW_UP_FILTER: Record<'scheduled' | 'failed' | 'cancelled', FollowUpFilter> = {
    scheduled: 'upcoming',
    failed: 'failed',
    cancelled: 'cancelled',
};

export interface ListRow {
    job: Job;
    card: ApplicationCard;
}

export interface FilterOptions {
    companies: string[];
    locations: string[];
    workTypes: string[];
}

export interface ApplicationsPage {
    rows: ListRow[];
    total: number;
    page: number;
    totalPages: number;
    pageSize: number;
    truncated: boolean;
    options: FilterOptions;
}

export async function loadApplicationsPage(
    supabase: SupabaseClient,
    userId: string,
    query: ListQuery
): Promise<ApplicationsPage> {
    const options = await loadFilterOptions(supabase, userId);

    const followUpJobIds = await followUpJobIdsFor(supabase, userId, query.status);
    if (followUpJobIds && followUpJobIds.size === 0) {
        return emptyPage(query.page, options);
    }

    const listing = query.sort === 'next_follow_up'
        ? await pageBySoonestFollowUp(supabase, userId, query, followUpJobIds)
        : await pageByColumn(supabase, userId, query, followUpJobIds);

    const jobs = listing.jobs.filter((job) => job.user_id === userId);

    const emailsByJob = await emailsFor(supabase, userId, jobs.map((j) => j.id));
    const rows: ListRow[] = jobs.map((job) => ({
        job,
        card: buildApplicationCard(job, emailsByJob.get(job.id) ?? []),
    }));

    return {
        rows,
        total: listing.total,
        page: listing.page,
        totalPages: listing.totalPages,
        pageSize: PAGE_SIZE,
        truncated: listing.truncated,
        options,
    };
}

// The filter, search and scope, applied to the jobs table. The same definitions are used for every sort.
function jobsQuery(
    supabase: SupabaseClient,
    userId: string,
    query: ListQuery,
    followUpJobIds: ReadonlySet<string> | null,
    columns: string,
    withCount = false
) {
    let q = supabase
        .from('jobs')
        .select(columns, withCount ? { count: 'exact' } : undefined)
        .eq('user_id', userId);

    if (query.q) {
        // Search text is sanitized in lib/applications/list.ts, so it cannot change the filter structure.
        const pattern = `%${query.q}%`;
        q = q.or(`company.ilike.${pattern},title.ilike.${pattern},recruiter_name.ilike.${pattern},recruiter_email.ilike.${pattern}`);
    }

    const definition = STATUS_DEFINITIONS[query.status];
    if (definition.jobStatuses) q = q.in('status', definition.jobStatuses);
    if (definition.sent) q = q.not('sent_at', 'is', null);
    if (followUpJobIds) q = q.in('id', [...followUpJobIds]);

    if (query.company) q = q.eq('company', query.company);
    if (query.location) q = q.eq('location', query.location);
    if (query.work_type) q = q.eq('work_type', query.work_type);

    return q;
}

function ordered(q: ReturnType<typeof jobsQuery>, sort: SortKey) {
    switch (sort) {
        case 'oldest':
            return q.order('created_at', { ascending: true }).order('id', { ascending: true });
        case 'sent':
            return q.order('sent_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: true });
        case 'replied':
            return q.order('replied_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).order('id', { ascending: true });
        default:
            return q.order('created_at', { ascending: false }).order('id', { ascending: true });
    }
}

async function pageByColumn(
    supabase: SupabaseClient,
    userId: string,
    query: ListQuery,
    followUpJobIds: ReadonlySet<string> | null
) {
    const fetchPage = (page: number) => {
        const from = (page - 1) * PAGE_SIZE;
        return ordered(jobsQuery(supabase, userId, query, followUpJobIds, '*', true), query.sort).range(from, from + PAGE_SIZE - 1);
    };

    const first = await fetchPage(query.page);
    if (first.error) throw new Error(`Could not load applications: ${first.error.message}`);

    const total = first.count ?? 0;
    const window = pageWindow(query.page, total);

    // A page past the end shows the last page, so a stale bookmark still lands on results.
    const result = window.page === query.page ? first : await fetchPage(window.page);
    if (result.error) throw new Error(`Could not load applications: ${result.error.message}`);

    return {
        jobs: (result.data ?? []) as unknown as Job[],
        total,
        page: window.page,
        totalPages: window.totalPages,
        truncated: false,
    };
}

// "Next follow-up" needs the due date of each application, which lives in another table. So the matching
// applications are listed by id, sorted in code with a fixed tie-break, and only the requested page is loaded in full.
async function pageBySoonestFollowUp(
    supabase: SupabaseClient,
    userId: string,
    query: ListQuery,
    followUpJobIds: ReadonlySet<string> | null
) {
    const { data: candidateRows, error } = await jobsQuery(supabase, userId, query, followUpJobIds, 'id, created_at, user_id').limit(LIGHT_LIMIT);
    if (error) throw new Error(`Could not load applications: ${error.message}`);
    const candidates = (candidateRows ?? []) as unknown as { id: string; created_at: string; user_id: string }[];

    const { data: scheduled, error: scheduleError } = await supabase
        .from('application_emails')
        .select('job_id, due_at')
        .eq('user_id', userId)
        .eq('kind', 'follow_up')
        .eq('status', 'scheduled')
        .not('due_at', 'is', null)
        .limit(LIGHT_LIMIT);
    if (scheduleError) throw new Error(`Could not load follow-ups: ${scheduleError.message}`);

    const nextDue = new Map<string, string>();
    for (const row of scheduled ?? []) {
        const current = nextDue.get(row.job_id);
        if (!current || Date.parse(row.due_at) < Date.parse(current)) nextDue.set(row.job_id, row.due_at);
    }

    const sorted = candidates
        .filter((c) => c.user_id === userId)
        .map((c) => ({ id: c.id, createdAt: c.created_at, nextDueAt: nextDue.get(c.id) ?? null }))
        .sort(compareNextFollowUp);

    const total = sorted.length;
    const window = pageWindow(query.page, total);
    const pageIds = sorted.slice(window.from, window.to + 1).map((s) => s.id);

    if (pageIds.length === 0) {
        return { jobs: [] as Job[], total, page: window.page, totalPages: window.totalPages, truncated: total >= LIGHT_LIMIT };
    }

    const { data: fullRows, error: fullError } = await jobsQuery(supabase, userId, query, followUpJobIds, '*').in('id', pageIds);
    if (fullError) throw new Error(`Could not load applications: ${fullError.message}`);
    const loaded = (fullRows ?? []) as unknown as Job[];

    // Keep the order computed above, not the order the database returned.
    const byId = new Map(loaded.map((j) => [j.id, j]));
    return {
        jobs: pageIds.map((id) => byId.get(id)).filter((j): j is Job => Boolean(j)),
        total,
        page: window.page,
        totalPages: window.totalPages,
        truncated: total >= LIGHT_LIMIT,
    };
}

// Job ids that have a follow-up in the state the filter needs. Null when the filter is not about follow-ups.
async function followUpJobIdsFor(supabase: SupabaseClient, userId: string, status: StatusFilter): Promise<Set<string> | null> {
    const state = STATUS_DEFINITIONS[status].followUpState;
    if (!state) return null;

    const { data, error } = await supabase
        .from('application_emails')
        .select('job_id, user_id, kind, status')
        .eq('user_id', userId)
        .eq('kind', 'follow_up')
        .eq('status', state)
        .limit(LIGHT_LIMIT);
    if (error) throw new Error(`Could not load follow-ups: ${error.message}`);

    return new Set(jobIdsWithFollowUp(data ?? [], userId, FOLLOW_UP_FILTER[state]));
}

async function emailsFor(supabase: SupabaseClient, userId: string, jobIds: string[]): Promise<Map<string, DashboardEmail[]>> {
    const byJob = new Map<string, DashboardEmail[]>();
    if (jobIds.length === 0) return byJob;

    const { data, error } = await supabase
        .from('application_emails')
        .select('id, job_id, user_id, kind, follow_up_number, status, due_at, sent_at, attempts, error_code, created_at')
        .eq('user_id', userId)
        .in('job_id', jobIds);
    if (error) throw new Error(`Could not load application emails: ${error.message}`);

    for (const row of (data ?? []) as DashboardEmail[]) {
        if (row.user_id !== userId) continue;
        const list = byJob.get(row.job_id) ?? [];
        list.push(row);
        byJob.set(row.job_id, list);
    }
    return byJob;
}

async function loadFilterOptions(supabase: SupabaseClient, userId: string): Promise<FilterOptions> {
    const { data, error } = await supabase
        .from('jobs')
        .select('company, location, work_type')
        .eq('user_id', userId)
        .limit(OPTION_LIMIT);
    if (error) throw new Error(`Could not load filter options: ${error.message}`);

    const distinct = (key: 'company' | 'location' | 'work_type') =>
        [...new Set((data ?? []).map((row: Record<string, string | null>) => row[key]).filter((v): v is string => Boolean(v)))].sort();

    return {
        companies: distinct('company'),
        locations: distinct('location'),
        workTypes: distinct('work_type'),
    };
}

function emptyPage(page: number, options: FilterOptions): ApplicationsPage {
    const window = pageWindow(page, 0);
    return { rows: [], total: 0, page: window.page, totalPages: window.totalPages, pageSize: PAGE_SIZE, truncated: false, options };
}