'use client'
import { PaginationMeta } from '@/lib/types/posts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

interface PaginationProps {
    meta: PaginationMeta
}

export default function Pagination({ meta }: PaginationProps) {
    const router = useRouter()

    const navigateToPage = useCallback((page: number) => {
        const params = new URLSearchParams(window.location.search)
        params.set('page', page.toString())
        router.push(`/dashboard?${params.toString()}`)
    }, [router])

    return (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="flex flex-1 justify-between sm:hidden">
                <button
                    onClick={() => navigateToPage(meta.page - 1)}
                    disabled={meta.page <= 1}
                    className="relative inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                    Previous
                </button>
                <button
                    onClick={() => navigateToPage(meta.page + 1)}
                    disabled={meta.page >= meta.totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                    Next
                </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-muted-foreground">
                        Showing <span className="font-medium">{((meta.page - 1) * meta.pageSize) + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(meta.page * meta.pageSize, meta.total)}</span> of{' '}
                        <span className="font-medium">{meta.total}</span> results
                    </p>
                </div>
                <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                            onClick={() => navigateToPage(meta.page - 1)}
                            disabled={meta.page <= 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-muted-foreground ring-1 ring-inset ring-border hover:bg-accent disabled:opacity-50"
                        >
                            <span className="sr-only">Previous</span>
                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>

                        {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                            let pageNum
                            if (meta.totalPages <= 5) {
                                pageNum = i + 1
                            } else if (meta.page <= 3) {
                                pageNum = i + 1
                            } else if (meta.page >= meta.totalPages - 2) {
                                pageNum = meta.totalPages - 4 + i
                            } else {
                                pageNum = meta.page - 2 + i
                            }

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => navigateToPage(pageNum)}
                                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${meta.page === pageNum
                                            ? 'z-10 bg-primary text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
                                            : 'text-foreground ring-1 ring-inset ring-border hover:bg-accent'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            )
                        })}

                        <button
                            onClick={() => navigateToPage(meta.page + 1)}
                            disabled={meta.page >= meta.totalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-muted-foreground ring-1 ring-inset ring-border hover:bg-accent disabled:opacity-50"
                        >
                            <span className="sr-only">Next</span>
                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    )
}