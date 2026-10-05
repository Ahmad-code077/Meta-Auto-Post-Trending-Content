'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PaginationMeta } from '@/lib/types/posts'

interface PaginationProps {
    meta: PaginationMeta
}

// Page links keep the other filters in the URL.
export default function Pagination({ meta }: PaginationProps) {
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const hrefFor = (page: number) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', String(page))
        return `${pathname}?${params.toString()}`
    }

    const start = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4))
    const end = Math.min(meta.totalPages, start + 4)
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

    const from = (meta.page - 1) * meta.pageSize + 1
    const to = Math.min(meta.page * meta.pageSize, meta.total)

    const navClass = (disabled: boolean) => cn(
        buttonVariants({ variant: 'outline', size: 'icon' }),
        disabled && 'pointer-events-none opacity-50'
    )

    return (
        <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
                {from} to {to} of {meta.total}
            </p>

            <div className="flex items-center gap-1">
                <Link
                    href={hrefFor(meta.page - 1)}
                    scroll={false}
                    aria-label="Previous page"
                    aria-disabled={meta.page <= 1}
                    tabIndex={meta.page <= 1 ? -1 : undefined}
                    className={navClass(meta.page <= 1)}
                >
                    <ChevronLeft />
                </Link>

                {pages.map((page) => (
                    <Link
                        key={page}
                        href={hrefFor(page)}
                        scroll={false}
                        aria-current={page === meta.page ? 'page' : undefined}
                        className={cn(
                            buttonVariants({ variant: page === meta.page ? 'default' : 'outline', size: 'icon' }),
                            'tabular-nums'
                        )}
                    >
                        {page}
                    </Link>
                ))}

                <Link
                    href={hrefFor(meta.page + 1)}
                    scroll={false}
                    aria-label="Next page"
                    aria-disabled={meta.page >= meta.totalPages}
                    tabIndex={meta.page >= meta.totalPages ? -1 : undefined}
                    className={navClass(meta.page >= meta.totalPages)}
                >
                    <ChevronRight />
                </Link>
            </div>
        </nav>
    )
}
