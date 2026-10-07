// Query model for the applications list: URL parsing, filter and sort definitions, and URL building.
// Pure, so the rules are tested without a database. The data layer (lib/data/applications.ts) applies the
// same definitions to the database query, so there is one definition of each filter, not two.

import type { FollowUpFilter } from '@/lib/timeline/filters';

export const LIST_PATH = '/dashboard/job-posts';
export const PAGE_SIZE = 10;
export const SEARCH_MAX_LENGTH = 100;
const TEXT_MAX_LENGTH = 120;
const MAX_PAGE = 100_000;

// Statuses that mean "sent and no reply yet". The same list the scheduler and the inbox sync use.
const AWAITING = ['sent', 'follow_up_1', 'follow_up_2'];

export const STATUS_FILTERS = [
    'all', 'new', 'draft', 'sent', 'waiting', 'replied', 'scheduled', 'failed', 'cancelled', 'closed',
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_KEYS = ['newest', 'oldest', 'sent', 'next_follow_up', 'replied'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ListQuery {
    q: string;
    status: StatusFilter;
    company: string;
    location: string;
    work_type: string;
    sort: SortKey;
    page: number;
}

export const DEFAULT_QUERY: ListQuery = {
    q: '',
    status: 'all',
    company: '',
    location: '',
    work_type: '',
    sort: 'newest',
    page: 1,
};

export interface StatusDefinition {
    label: string;
    // Job statuses that match, when the filter is about the job itself.
    jobStatuses?: string[];
    // Jobs that were sent, including ones that have since been replied to or closed.
    sent?: boolean;
    // Jobs that have at least one follow-up in this state.
    followUpState?: Exclude<FollowUpFilter, 'upcoming'> | 'scheduled';
}

export const STATUS_DEFINITIONS: Record<StatusFilter, StatusDefinition> = {
    all: { label: 'All statuses' },
    new: { label: 'New, no draft yet', jobStatuses: ['new'] },
    draft: { label: 'Draft', jobStatuses: ['draft_created'] },
    sent: { label: 'Sent', sent: true },
    waiting: { label: 'Waiting for reply', jobStatuses: AWAITING },
    replied: { label: 'Replied', jobStatuses: ['replied'] },
    scheduled: { label: 'Follow-up scheduled', followUpState: 'scheduled' },
    failed: { label: 'Follow-up failed', followUpState: 'failed' },
    cancelled: { label: 'Follow-up cancelled', followUpState: 'cancelled' },
    closed: { label: 'Closed', jobStatuses: ['closed_no_response'] },
};

export const SORT_DEFINITIONS: Record<SortKey, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    sent: 'Recently sent',
    next_follow_up: 'Next follow-up',
    replied: 'Recently replied',
};

// Reads a value from URL parameters, taking the first one if it was repeated.
type RawParams = Record<string, string | string[] | undefined>;

export function parseListQuery(params: RawParams): ListQuery {
    const first = (key: string): string | undefined => {
        const value = params[key];
        return Array.isArray(value) ? value[0] : value;
    };

    return {
        q: sanitizeSearch(first('q') ?? ''),
        status: oneOf(first('status'), STATUS_FILTERS, DEFAULT_QUERY.status),
        company: text(first('company')),
        location: text(first('location')),
        work_type: text(first('work_type')),
        sort: oneOf(first('sort'), SORT_KEYS, DEFAULT_QUERY.sort),
        page: positiveInt(first('page')) ?? DEFAULT_QUERY.page,
    };
}

// Removes characters that have meaning in a PostgREST filter or in a LIKE pattern, so the search is always literal text.
export function sanitizeSearch(value: string): string {
    return value
        .replace(/[,()"'\\%_*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, SEARCH_MAX_LENGTH)
        .trim();
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
    return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: string | undefined): string {
    return (value ?? '').trim().slice(0, TEXT_MAX_LENGTH);
}

function positiveInt(value: string | undefined): number | null {
    if (value === undefined || !/^\d{1,9}$/.test(value)) return null;
    const n = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(n) || n < 1) return null;
    return Math.min(n, MAX_PAGE);
}

// Builds a list URL. Defaults are left out, so a plain view has a plain URL. Changing any filter resets to page 1.
export function buildListHref(current: ListQuery, changes: Partial<ListQuery>, base = LIST_PATH): string {
    const next: ListQuery = { ...current, ...changes };
    // Changing a filter or the sort starts again from page 1. Building a link without changes keeps the page.
    if (!('page' in changes) && Object.keys(changes).length > 0) next.page = 1;

    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.status !== DEFAULT_QUERY.status) params.set('status', next.status);
    if (next.company) params.set('company', next.company);
    if (next.location) params.set('location', next.location);
    if (next.work_type) params.set('work_type', next.work_type);
    if (next.sort !== DEFAULT_QUERY.sort) params.set('sort', next.sort);
    if (next.page !== 1) params.set('page', String(next.page));

    const query = params.toString();
    return query ? `${base}?${query}` : base;
}

export function hasActiveFilters(query: ListQuery): boolean {
    return query.q !== '' || query.status !== 'all' || query.company !== '' || query.location !== '' || query.work_type !== '';
}

// Whether a job matches a status filter, given the set of job ids that have a follow-up in the needed state.
// The database query applies the same definition.
export function matchesStatus(
    job: { id: string; status: string; sent_at: string | null },
    filter: StatusFilter,
    followUpJobIds: ReadonlySet<string>
): boolean {
    const definition = STATUS_DEFINITIONS[filter];
    if (filter === 'all') return true;
    if (definition.followUpState) return followUpJobIds.has(job.id);
    if (definition.sent) return job.sent_at !== null;
    return (definition.jobStatuses ?? []).includes(job.status);
}

// Page window and clamped page number. A page past the end falls back to the last page.
export function pageWindow(page: number, total: number, size = PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(total / size));
    const clamped = Math.min(Math.max(1, page), totalPages);
    return {
        page: clamped,
        totalPages,
        from: (clamped - 1) * size,
        to: (clamped - 1) * size + size - 1,
    };
}

// Order for "next follow-up". Applications with a due follow-up come first, soonest first. Applications without one
// come after. Ties go to the newest application, then to the id, so the order never changes between requests.
export interface NextFollowUpSortable {
    id: string;
    createdAt: string;
    nextDueAt: string | null;
}

export function compareNextFollowUp(a: NextFollowUpSortable, b: NextFollowUpSortable): number {
    const aDue = a.nextDueAt ? Date.parse(a.nextDueAt) : null;
    const bDue = b.nextDueAt ? Date.parse(b.nextDueAt) : null;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue !== null && bDue === null) return -1;
    if (aDue === null && bDue !== null) return 1;
    const created = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (created !== 0) return created;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
