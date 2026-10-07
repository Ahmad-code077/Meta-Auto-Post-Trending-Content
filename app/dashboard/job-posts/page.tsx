import { ApplicationFilters } from '@/components/jobs/application-filters'
import { ApplicationsList } from '@/components/jobs/applications-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parseListQuery } from '@/lib/applications/list'
import { loadApplicationsPage } from '@/lib/data/applications'
import { requireUser } from '@/lib/supabase/server'

// The applications list. Filters, search, sort and page live in the URL and are applied on the server.
// Invalid values fall back to the defaults, so a bad or old link still shows results.
export default async function JobPostsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const query = parseListQuery(await searchParams)
    const { supabase, user } = await requireUser()
    const page = await loadApplicationsPage(supabase, user.id, query)

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Applications</CardTitle>
                    <CardDescription>Search, filter and sort your applications. Open one to review it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <ApplicationFilters query={query} options={page.options} />
                    <ApplicationsList page={page} query={query} />
                </CardContent>
            </Card>
        </div>
    )
}
