'use client'

import { PaginationMeta } from '@/lib/types/posts'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { JSX, useCallback } from 'react'
import {
    Pagination as ShadcnPagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
} from "@/components/ui/pagination"
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
    meta: PaginationMeta
}

export default function Pagination({ meta }: PaginationProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const navigateToPage = useCallback((page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', page.toString())
        router.push(`${pathname}?${params.toString()}`)
        router.refresh()
    }, [router, pathname, searchParams])

    const renderPageNumbers = () => {
        const pages: JSX.Element[] = []
        const maxVisible = 5

        // Calculate visible page range
        let start = Math.max(1, meta.page - Math.floor(maxVisible / 2))
        const end = Math.min(meta.totalPages, start + maxVisible - 1)

        // Adjust if we're at the end
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1)
        }

        // Previous button (handled separately in ShadcnPagination)
        // Add ellipsis if needed at start
        if (start > 1) {
            pages.push(
                <PaginationItem key={1}>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigateToPage(1)}
                        className="h-9 w-9"
                    >
                        1
                    </Button>
                </PaginationItem>
            )

            if (start > 2) {
                pages.push(
                    <PaginationItem key="ellipsis-start">
                        <PaginationEllipsis />
                    </PaginationItem>
                )
            }
        }

        // Add visible pages
        for (let i = start; i <= end; i++) {
            pages.push(
                <PaginationItem key={i}>
                    <Button
                        variant={meta.page === i ? "default" : "outline"}
                        size="icon"
                        onClick={() => navigateToPage(i)}
                        className="h-9 w-9"
                    >
                        {i}
                    </Button>
                </PaginationItem>
            )
        }

        // Add ellipsis and last page if needed
        if (end < meta.totalPages) {
            if (end < meta.totalPages - 1) {
                pages.push(
                    <PaginationItem key="ellipsis-end">
                        <PaginationEllipsis />
                    </PaginationItem>
                )
            }

            pages.push(
                <PaginationItem key={meta.totalPages}>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => navigateToPage(meta.totalPages)}
                        className="h-9 w-9"
                    >
                        {meta.totalPages}
                    </Button>
                </PaginationItem>
            )
        }

        return pages
    }

    // Mobile version
    const MobilePagination = () => (
        <div className="flex items-center justify-between sm:hidden">
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPage(meta.page - 1)}
                    disabled={meta.page <= 1}
                    className="gap-1"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPage(meta.page + 1)}
                    disabled={meta.page >= meta.totalPages}
                    className="gap-1"
                >
                    Next
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )

    return (
        <div className="space-y-4">
            {/* Mobile Pagination */}
            <MobilePagination />

            {/* Desktop Pagination */}
            <div className="hidden sm:block">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Page info */}
                    <div className="text-sm text-muted-foreground">
                        Showing <span className="font-medium">{((meta.page - 1) * meta.pageSize) + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(meta.page * meta.pageSize, meta.total)}</span> of{' '}
                        <span className="font-medium">{meta.total}</span> results
                    </div>

                    {/* Shadcn Pagination */}
                    <ShadcnPagination>
                        <PaginationContent>
                            {/* Previous Button */}
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigateToPage(meta.page - 1)}
                                    disabled={meta.page <= 1}
                                    className="h-9 w-9"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    <span className="sr-only">Previous</span>
                                </Button>
                            </PaginationItem>

                            {/* Page Numbers */}
                            {renderPageNumbers()}

                            {/* Next Button */}
                            <PaginationItem>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigateToPage(meta.page + 1)}
                                    disabled={meta.page >= meta.totalPages}
                                    className="h-9 w-9"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    <span className="sr-only">Next</span>
                                </Button>
                            </PaginationItem>
                        </PaginationContent>
                    </ShadcnPagination>
                </div>
            </div>

            {/* Alternative using only ShadcnPagination (simpler version) */}
            {/* Uncomment if you prefer this simpler version */}
            {/* 
      <ShadcnPagination>
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateToPage(meta.page - 1)}
              disabled={meta.page <= 1}
              className="h-9 w-9"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous</span>
            </Button>
          </PaginationItem>
          
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
              <PaginationItem key={pageNum}>
                <Button
                  variant={meta.page === pageNum ? "default" : "outline"}
                  size="icon"
                  onClick={() => navigateToPage(pageNum)}
                  className="h-9 w-9"
                >
                  {pageNum}
                </Button>
              </PaginationItem>
            )
          })}
          
          <PaginationItem>
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigateToPage(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              className="h-9 w-9"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next</span>
            </Button>
          </PaginationItem>
        </PaginationContent>
      </ShadcnPagination>
      */}
        </div>
    )
}