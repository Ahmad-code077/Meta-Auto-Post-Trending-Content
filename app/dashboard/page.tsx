import { getPosts } from '@/lib/data/posts'
import PostsTable from '@/components/posts/posts-table'
import FilterBar from '@/components/posts/filter-bar'
import Pagination from '@/components/posts/pagination'
import { Suspense } from 'react'
import { FilterStatus } from '@/lib/types/posts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { deleteOldPosts, getDeletablePostsCount } from '@/lib/actions/posts'

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

    // Get count of deletable posts (older than 24h, not published)
    const deletablePostsCount = await getDeletablePostsCount()

    // Create a server action wrapper that returns void
    async function handleDeleteOldPosts() {
        'use server'
        await deleteOldPosts() // Don't return anything
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Content Moderation Dashboard</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage posts with AI image generation and multi-platform publishing
                    </p>
                </div>

                {deletablePostsCount > 0 && (
                    <form action={handleDeleteOldPosts}>
                        <Button
                            type="submit"
                            variant="destructive"
                            className="gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete Old Posts ({deletablePostsCount})
                        </Button>
                    </form>
                )}
                {deletablePostsCount === 0 && (
                    <div className="text-sm text-muted-foreground">
                        No old posts to delete
                    </div>
                )}
            </div>

            {/* FilterBar needs Suspense because it uses useSearchParams() */}
            <Suspense fallback={
                <div className="animate-pulse h-12 bg-muted rounded-lg"></div>
            }>
                <FilterBar initialFilters={{ ...filters, status }} />
            </Suspense>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Posts</CardTitle>
                            <CardDescription>
                                Total {meta.total} posts • Page {meta.page} of {meta.totalPages}
                            </CardDescription>
                        </div>
                        <div className="text-sm font-medium text-muted-foreground">
                            Showing {posts.length} posts
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <PostsTable posts={posts} />

                    {meta.totalPages > 1 && (
                        <div className="mt-8">
                            <Pagination meta={meta} />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}