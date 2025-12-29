import { getPosts } from '@/lib/data/posts'
import PostsTable from '@/components/posts/posts-table'
import FilterBar from '@/components/posts/filter-bar'
import Pagination from '@/components/posts/pagination'
import { Suspense } from 'react'
import { FilterStatus } from '@/lib/types/posts'

interface DashboardPageProps {
    searchParams: Promise<{
        page?: string
        status?: string
        search?: string
        dateFrom?: string
        dateTo?: string
    }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
    const params = await searchParams

    const validStatuses: FilterStatus[] = ['all', 'pending', 'approved', 'rejected', 'published']
    const status = params.status && validStatuses.includes(params.status as FilterStatus)
        ? params.status as FilterStatus
        : 'all'

    const filters = {
        page: params.page ? parseInt(params.page) : 1,
        status: status === 'all' ? undefined : status,
        search: params.search,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        pageSize: 10
    }

    const { posts, meta } = await getPosts(filters)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">Content Moderation Dashboard</h1>
                <p className="text-muted-foreground mt-1">
                    Manage posts with AI image generation and multi-platform publishing
                </p>
            </div>

            {/* REMOVE onFilterChange prop - FilterBar handles its own state */}
            <Suspense fallback={
                <div className="animate-pulse h-10 bg-muted rounded-md"></div>
            }>
                <FilterBar initialFilters={{ ...filters, status }} />
            </Suspense>

            <div className="bg-card rounded-lg border border-border p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-foreground">
                        Posts ({meta.total})
                    </h2>
                    <div className="text-sm text-muted-foreground">
                        Page {meta.page} of {meta.totalPages}
                    </div>
                </div>

                <Suspense fallback={
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                }>
                    <PostsTable initialPosts={posts} />
                </Suspense>

                {meta.totalPages > 1 && (
                    <div className="mt-6">
                        <Pagination meta={meta} />
                    </div>
                )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">Workflow Information:</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
                    <li><strong>Pending:</strong> Click &quot;Generate Image&quot;  to send to AI image generator</li>
                    <li><strong>Approved:</strong> Select platforms and click &quot;Publish&quot; to post</li>
                    <li><strong>Published:</strong> Post has been sent to selected platforms</li>
                </ol>
            </div>
        </div>
    )
}