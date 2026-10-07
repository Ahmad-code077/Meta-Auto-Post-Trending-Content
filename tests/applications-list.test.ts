// Applications list: URL parsing, filters, search, sort, pagination and user isolation.
// The data layer is exercised against a recording fake client. No Supabase, OpenAI or SMTP call is made.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
    buildListHref,
    compareNextFollowUp,
    DEFAULT_QUERY,
    hasActiveFilters,
    matchesStatus,
    pageWindow,
    parseListQuery,
    PAGE_SIZE,
    sanitizeSearch,
    SEARCH_MAX_LENGTH,
    type ListQuery,
} from '../lib/applications/list'
import { loadApplicationsPage } from '../lib/data/applications'
import { setLogSink } from '../lib/log/logger'

setLogSink(() => {})

const ME = 'user-me'
const OTHER = 'user-other'

// ---------------------------------------------------------------------------
// URL parsing and validation
// ---------------------------------------------------------------------------

test('no parameters gives the default query', () => {
    assert.deepEqual(parseListQuery({}), DEFAULT_QUERY)
})

test('unknown status and sort values fall back to the defaults', () => {
    const query = parseListQuery({ status: 'deleted; drop table', sort: 'random' })
    assert.equal(query.status, 'all')
    assert.equal(query.sort, 'newest')
})

test('valid status and sort values are accepted', () => {
    const query = parseListQuery({ status: 'replied', sort: 'next_follow_up' })
    assert.equal(query.status, 'replied')
    assert.equal(query.sort, 'next_follow_up')
})

test('invalid page numbers fall back to page 1', () => {
    for (const page of ['abc', '0', '-3', '1.5', '', '99999999999999999999']) {
        assert.equal(parseListQuery({ page }).page, 1, `page=${page}`)
    }
    assert.equal(parseListQuery({ page: '4' }).page, 4)
})

test('a repeated parameter uses its first value', () => {
    assert.equal(parseListQuery({ status: ['draft', 'replied'], page: ['2', '9'] }).status, 'draft')
    assert.equal(parseListQuery({ page: ['2', '9'] }).page, 2)
})

test('search text is sanitized so it stays literal and cannot change the filter structure', () => {
    assert.equal(sanitizeSearch('acme, inc. (EU)'), 'acme inc. EU')
    assert.equal(sanitizeSearch('100% "quoted" back\\slash *star*'), '100 quoted back slash star')
    assert.equal(sanitizeSearch('   spaced    out   '), 'spaced out')
    assert.equal(sanitizeSearch(`${'a'.repeat(300)}`).length, SEARCH_MAX_LENGTH)
})

test('company, location and work type are trimmed and length-capped', () => {
    const query = parseListQuery({ company: `  Globex  ${'x'.repeat(500)}` })
    assert.ok(query.company.startsWith('Globex'))
    assert.ok(query.company.length <= 120)
    assert.equal(parseListQuery({ company: '   ' }).company, '')
})

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

test('a plain view has a plain URL, with defaults left out', () => {
    assert.equal(buildListHref(DEFAULT_QUERY, {}), '/dashboard/job-posts')
})

test('changing a filter resets to page 1, and the other filters are kept', () => {
    const current: ListQuery = { ...DEFAULT_QUERY, q: 'acme', page: 4 }
    const href = buildListHref(current, { status: 'draft' })
    const params = new URLSearchParams(href.split('?')[1])
    assert.equal(params.get('q'), 'acme')
    assert.equal(params.get('status'), 'draft')
    assert.equal(params.get('page'), null)
})

test('paging keeps the filters and sets the page', () => {
    const current: ListQuery = { ...DEFAULT_QUERY, status: 'waiting', sort: 'sent' }
    const params = new URLSearchParams(buildListHref(current, { page: 3 }).split('?')[1])
    assert.equal(params.get('status'), 'waiting')
    assert.equal(params.get('sort'), 'sent')
    assert.equal(params.get('page'), '3')
})

test('search text is URL-encoded in the link', () => {
    const href = buildListHref({ ...DEFAULT_QUERY, q: 'R&D team' }, {})
    assert.equal(new URLSearchParams(href.split('?')[1]).get('q'), 'R&D team')
})

test('a link built from a parsed query parses back to the same query', () => {
    const original = parseListQuery({ q: 'acme', status: 'scheduled', sort: 'oldest', page: '2', company: 'Globex' })
    const href = buildListHref(original, {}, '/x')
    const roundTrip = parseListQuery(Object.fromEntries(new URLSearchParams(href.split('?')[1])))
    assert.deepEqual(roundTrip, { ...original, page: 2 })
})

test('hasActiveFilters is false only for the default filters, sort and page do not count', () => {
    assert.equal(hasActiveFilters(DEFAULT_QUERY), false)
    assert.equal(hasActiveFilters({ ...DEFAULT_QUERY, sort: 'oldest' }), false)
    assert.equal(hasActiveFilters({ ...DEFAULT_QUERY, q: 'x' }), true)
    assert.equal(hasActiveFilters({ ...DEFAULT_QUERY, status: 'closed' }), true)
})

// ---------------------------------------------------------------------------
// Status filters
// ---------------------------------------------------------------------------

const followUpIds = new Set(['with-scheduled'])

function job(id: string, status: string, sentAt: string | null = null) {
    return { id, status, sent_at: sentAt }
}

test('the all filter matches every application', () => {
    assert.equal(matchesStatus(job('a', 'new'), 'all', new Set()), true)
})

test('draft matches only applications with a draft ready for review', () => {
    assert.equal(matchesStatus(job('a', 'draft_created'), 'draft', new Set()), true)
    assert.equal(matchesStatus(job('a', 'new'), 'draft', new Set()), false)
    assert.equal(matchesStatus(job('a', 'sent', '2026-09-01T00:00:00Z'), 'draft', new Set()), false)
})

test('sent includes every application that was sent, including ones since replied to or closed', () => {
    const sentAt = '2026-09-01T00:00:00Z'
    assert.equal(matchesStatus(job('a', 'sent', sentAt), 'sent', new Set()), true)
    assert.equal(matchesStatus(job('a', 'replied', sentAt), 'sent', new Set()), true)
    assert.equal(matchesStatus(job('a', 'closed_no_response', sentAt), 'sent', new Set()), true)
    assert.equal(matchesStatus(job('a', 'draft_created', null), 'sent', new Set()), false)
})

test('waiting for reply matches only the awaiting statuses', () => {
    for (const status of ['sent', 'follow_up_1', 'follow_up_2']) {
        assert.equal(matchesStatus(job('a', status, 'x'), 'waiting', new Set()), true, status)
    }
    assert.equal(matchesStatus(job('a', 'replied', 'x'), 'waiting', new Set()), false)
    assert.equal(matchesStatus(job('a', 'draft_created'), 'waiting', new Set()), false)
})

test('replied and closed match only their own statuses', () => {
    assert.equal(matchesStatus(job('a', 'replied', 'x'), 'replied', new Set()), true)
    assert.equal(matchesStatus(job('a', 'sent', 'x'), 'replied', new Set()), false)
    assert.equal(matchesStatus(job('a', 'closed_no_response', 'x'), 'closed', new Set()), true)
    assert.equal(matchesStatus(job('a', 'replied', 'x'), 'closed', new Set()), false)
})

test('the follow-up filters match by the follow-ups each application has, not by its own status', () => {
    assert.equal(matchesStatus(job('with-scheduled', 'sent', 'x'), 'scheduled', followUpIds), true)
    assert.equal(matchesStatus(job('other', 'sent', 'x'), 'scheduled', followUpIds), false)
    assert.equal(matchesStatus(job('with-scheduled', 'sent', 'x'), 'failed', new Set()), false)
    assert.equal(matchesStatus(job('with-failed', 'sent', 'x'), 'failed', new Set(['with-failed'])), true)
    assert.equal(matchesStatus(job('with-cancelled', 'replied', 'x'), 'cancelled', new Set(['with-cancelled'])), true)
})

// ---------------------------------------------------------------------------
// Pagination and ordering
// ---------------------------------------------------------------------------

test('a page window covers exactly one page of results', () => {
    assert.deepEqual(pageWindow(1, 25), { page: 1, totalPages: 3, from: 0, to: PAGE_SIZE - 1 })
    assert.deepEqual(pageWindow(3, 25), { page: 3, totalPages: 3, from: 20, to: 29 })
})

test('an empty result still has one page', () => {
    assert.deepEqual(pageWindow(1, 0), { page: 1, totalPages: 1, from: 0, to: PAGE_SIZE - 1 })
})

test('a page past the end falls back to the last page', () => {
    assert.equal(pageWindow(40, 25).page, 3)
})

test('next-follow-up order puts due applications first, soonest first, then the rest by newest', () => {
    const items = [
        { id: 'none-old', createdAt: '2026-08-01T00:00:00Z', nextDueAt: null },
        { id: 'later', createdAt: '2026-08-02T00:00:00Z', nextDueAt: '2026-10-09T09:00:00Z' },
        { id: 'sooner', createdAt: '2026-08-03T00:00:00Z', nextDueAt: '2026-10-05T09:00:00Z' },
        { id: 'none-new', createdAt: '2026-09-01T00:00:00Z', nextDueAt: null },
    ]
    assert.deepEqual([...items].sort(compareNextFollowUp).map((i) => i.id), ['sooner', 'later', 'none-new', 'none-old'])
})

test('ties are broken deterministically, whatever the input order', () => {
    const same = [
        { id: 'b', createdAt: '2026-09-01T00:00:00Z', nextDueAt: null },
        { id: 'a', createdAt: '2026-09-01T00:00:00Z', nextDueAt: null },
        { id: 'c', createdAt: '2026-09-02T00:00:00Z', nextDueAt: null },
    ]
    const expected = ['c', 'a', 'b']
    assert.deepEqual([...same].sort(compareNextFollowUp).map((i) => i.id), expected)
    assert.deepEqual([...same].reverse().sort(compareNextFollowUp).map((i) => i.id), expected)
    assert.deepEqual([...same].sort((x, y) => (x.id < y.id ? 1 : -1)).sort(compareNextFollowUp).map((i) => i.id), expected)
})

// ---------------------------------------------------------------------------
// Data layer: a recording fake client
// ---------------------------------------------------------------------------

interface Op { method: string; args: unknown[] }
interface Recorded { table: string; ops: Op[] }

const SCOPED = (ops: Op[]) => ops.some((op) => op.method === 'eq' && op.args[0] === 'user_id' && op.args[1] === ME)

class FakeQuery {
    readonly ops: Op[] = []

    constructor(private readonly table: string, private readonly fixture: Fixture, private readonly log: Recorded[]) {
        log.push({ table, ops: this.ops })
    }

    private record(method: string, args: unknown[]) {
        this.ops.push({ method, args })
        return this
    }

    select(...args: unknown[]) { return this.record('select', args) }
    eq(...args: unknown[]) { return this.record('eq', args) }
    neq(...args: unknown[]) { return this.record('neq', args) }
    in(...args: unknown[]) { return this.record('in', args) }
    or(...args: unknown[]) { return this.record('or', args) }
    not(...args: unknown[]) { return this.record('not', args) }
    order(...args: unknown[]) { return this.record('order', args) }
    range(...args: unknown[]) { return this.record('range', args) }
    limit(...args: unknown[]) { return this.record('limit', args) }
    gte(...args: unknown[]) { return this.record('gte', args) }
    lte(...args: unknown[]) { return this.record('lte', args) }
    lt(...args: unknown[]) { return this.record('lt', args) }
    is(...args: unknown[]) { return this.record('is', args) }
    ilike(...args: unknown[]) { return this.record('ilike', args) }
    maybeSingle() { return this.record('maybeSingle', []) }
    single() { return this.record('single', []) }

    then<T>(resolve: (value: unknown) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve(this.fixture(this.table, this.ops)).then(resolve, reject)
    }
}

type Fixture = (table: string, ops: Op[]) => { data: unknown; error: null; count?: number }

function fakeClient(fixture: Fixture) {
    const log: Recorded[] = []
    const client = {
        from: (table: string) => new FakeQuery(table, fixture, log),
    }
    return { client, log }
}

function jobRow(overrides: Record<string, unknown> & { id: string }) {
    return {
        user_id: ME,
        title: 'Engineer',
        company: 'Globex',
        recruiter_name: null,
        recruiter_email: 'r@globex.com',
        status: 'sent',
        raw_post: 'x',
        created_at: '2026-09-20T10:00:00.000Z',
        sent_at: '2026-09-21T10:00:00.000Z',
        replied_at: null,
        location: null,
        work_type: null,
        ...overrides,
    }
}

function paged(rows: unknown[]): Fixture {
    return (table, ops) => {
        if (table === 'jobs') {
            const range = ops.find((o) => o.method === 'range')
            const slice = range ? rows.slice(Number(range.args[0]), Number(range.args[1]) + 1) : rows
            return { data: slice, error: null, count: rows.length }
        }
        if (table === 'application_emails') return { data: [], error: null }
        return { data: [], error: null }
    }
}

test('every query the list makes is scoped to the signed-in user', async () => {
    const { client, log } = fakeClient(paged([jobRow({ id: 'j1' })]))
    await loadApplicationsPage(client as never, ME, parseListQuery({ q: 'globex', status: 'waiting', sort: 'sent' }))

    assert.ok(log.length > 0)
    for (const query of log) {
        assert.equal(SCOPED(query.ops), true, `unscoped query on ${query.table}`)
    }
})

test('a follow-up filter also scopes its follow-up lookup to the user', async () => {
    const { client, log } = fakeClient((table) => ({
        data: table === 'application_emails' ? [{ job_id: 'j1', user_id: ME, kind: 'follow_up', status: 'failed' }] : [jobRow({ id: 'j1' })],
        error: null,
        count: 1,
    }))
    await loadApplicationsPage(client as never, ME, parseListQuery({ status: 'failed' }))
    const followUpQuery = log.find((q) => q.table === 'application_emails')!
    assert.equal(SCOPED(followUpQuery.ops), true)
})

test('rows that belong to another user are dropped even if the database returned them', async () => {
    const rows = [jobRow({ id: 'mine' }), jobRow({ id: 'theirs', user_id: OTHER, company: 'Secret Co' })]
    const { client } = fakeClient(paged(rows))
    const page = await loadApplicationsPage(client as never, ME, DEFAULT_QUERY)
    assert.deepEqual(page.rows.map((r) => r.job.id), ['mine'])
    assert.equal(page.rows.some((r) => r.job.company === 'Secret Co'), false)
})

test('the search is applied across company, role, recruiter name and recruiter email, with sanitized text', async () => {
    const { client, log } = fakeClient(paged([]))
    await loadApplicationsPage(client as never, ME, parseListQuery({ q: 'jane, doe (eu)' }))
    const searched = log.find((q) => q.table === 'jobs' && q.ops.some((o) => o.method === 'or'))!
    const or = searched.ops.find((o) => o.method === 'or')!
    const clause = String(or.args[0])
    for (const column of ['company', 'title', 'recruiter_name', 'recruiter_email']) {
        assert.ok(clause.includes(`${column}.ilike.%jane doe eu%`), `searches ${column}`)
    }
    assert.equal(clause.includes('('), false, 'no injected parentheses')
})

test('an empty follow-up result returns an empty page without loading any applications', async () => {
    const { client, log } = fakeClient(() => ({ data: [], error: null, count: 0 }))
    const page = await loadApplicationsPage(client as never, ME, parseListQuery({ status: 'scheduled' }))
    assert.equal(page.total, 0)
    assert.equal(page.rows.length, 0)
    assert.equal(log.some((q) => q.table === 'jobs' && q.ops.some((o) => o.method === 'select' && o.args[0] === '*')), false)
})

test('a page past the end reloads the last page', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => jobRow({ id: `j${i}`, created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString() }))
    const { client, log } = fakeClient(paged(rows))
    const page = await loadApplicationsPage(client as never, ME, parseListQuery({ page: '9' }))
    assert.equal(page.page, 3)
    assert.equal(page.totalPages, 3)
    assert.equal(page.rows.length, 5)
    const pageReads = log.filter((q) => q.table === 'jobs' && q.ops.some((o) => o.method === 'range'))
    assert.equal(pageReads.length, 2, 'the first request was past the end, so the page is read again')
})

test('the default page loads a bounded number of queries, whatever the number of applications', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => jobRow({ id: `j${i}` }))
    const { client, log } = fakeClient(paged(rows))
    await loadApplicationsPage(client as never, ME, DEFAULT_QUERY)
    assert.ok(log.length <= 4, `queries: ${log.length}`)
})

test('next-follow-up sort orders the whole result set, then loads only the requested page in full', async () => {
    const jobs = [
        jobRow({ id: 'late', created_at: '2026-08-01T00:00:00.000Z' }),
        jobRow({ id: 'soon', created_at: '2026-08-02T00:00:00.000Z' }),
        jobRow({ id: 'none', created_at: '2026-08-03T00:00:00.000Z' }),
    ]
    const { client, log } = fakeClient((table, ops) => {
        if (table === 'application_emails') {
            return {
                data: [
                    { job_id: 'late', due_at: '2026-10-09T09:00:00.000Z' },
                    { job_id: 'soon', due_at: '2026-10-05T09:00:00.000Z' },
                ],
                error: null,
            }
        }
        const idOnly = ops.some((o) => o.method === 'select' && o.args[0] === 'id, created_at, user_id')
        if (idOnly) return { data: jobs.map((j) => ({ id: j.id, created_at: j.created_at, user_id: j.user_id })), error: null }
        const requested = ops.find((o) => o.method === 'in' && o.args[0] === 'id')
        const ids = (requested?.args[1] as string[] | undefined) ?? []
        return { data: jobs.filter((j) => ids.includes(j.id)), error: null, count: jobs.length }
    })

    const page = await loadApplicationsPage(client as never, ME, parseListQuery({ sort: 'next_follow_up' }))

    assert.deepEqual(page.rows.map((r) => r.job.id), ['soon', 'late', 'none'])
    assert.equal(page.total, 3)
    const fullLoad = log.filter((q) => q.table === 'jobs' && q.ops.some((o) => o.method === 'in' && o.args[0] === 'id'))
    assert.equal(fullLoad.length, 1, 'only the page of ids is loaded in full')
})
