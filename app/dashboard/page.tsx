import { Suspense } from 'react'
import { getDeletablePostsCount, getPosts } from '@/lib/data/posts'
import PostsTable from '@/components/posts/posts-table'
import FilterBar from '@/components/posts/filter-bar'
import Pagination from '@/components/posts/pagination'
import { DeleteOldPostsButton } from '@/components/posts/delete-old-posts-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FilterStatus } from '@/lib/types/posts'

const VALID_STATUSES: FilterStatus[] = ['pending', 'approved', 'rejected', 'published']

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

    const status = VALID_STATUSES.includes(params.status as FilterStatus)
        ? (params.status as FilterStatus)
        : undefined

    const page = Math.max(1, parseInt(params.page ?? '', 10) || 1)

    const [{ posts, meta }, deletablePostsCount] = await Promise.all([
        getPosts({
            page,
            status,
            search: params.search,
            dateFrom: params.dateFrom,
            dateTo: params.dateTo,
            pageSize: 10,
        }),
        getDeletablePostsCount(),
    ])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Generate images, approve content, and publish to Instagram and Facebook.
                </p>
                <DeleteOldPostsButton count={deletablePostsCount} />
            </div>

            <Suspense fallback={<div className="h-10 animate-pulse rounded-md bg-muted" />}>
                <FilterBar />
            </Suspense>

            <Card>
                <CardHeader>
                    <CardTitle>All posts</CardTitle>
                    <CardDescription>
                        {meta.total} {meta.total === 1 ? 'post' : 'posts'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <PostsTable posts={posts} />

                    {meta.totalPages > 1 && (
                        <Suspense fallback={null}>
                            <Pagination meta={meta} />
                        </Suspense>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
