'use client'
import { Filters, FilterStatus } from '@/lib/types/posts'
import { Search, Filter, Calendar } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface FilterBarProps {
    initialFilters?: Filters
}

export default function FilterBar({ initialFilters }: FilterBarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [filters, setFilters] = useState<Filters>(initialFilters || {})
    const [showAdvanced, setShowAdvanced] = useState(false)

    const updateURL = useCallback((newFilters: Filters) => {
        const params = new URLSearchParams(searchParams.toString())

        // Update URL params based on filters
        if (newFilters.status && newFilters.status !== 'all') {
            params.set('status', newFilters.status)
        } else {
            params.delete('status')
        }

        if (newFilters.search) {
            params.set('search', newFilters.search)
        } else {
            params.delete('search')
        }

        if (newFilters.dateFrom) {
            params.set('dateFrom', newFilters.dateFrom)
        } else {
            params.delete('dateFrom')
        }

        if (newFilters.dateTo) {
            params.set('dateTo', newFilters.dateTo)
        } else {
            params.delete('dateTo')
        }

        if (newFilters.page && newFilters.page > 1) {
            params.set('page', newFilters.page.toString())
        } else {
            params.delete('page')
        }

        // Update URL
        router.push(`${pathname}?${params.toString()}`)
        router.refresh() // ← THIS IS THE KEY LINE!

    }, [router, pathname, searchParams])

    const handleChange = useCallback((key: keyof Filters, value: string | number | undefined) => {
        const newFilters = {
            ...filters,
            [key]: value,
            page: key === 'page' ? value as number : 1 // Reset to page 1 when filters change
        }
        setFilters(newFilters)
        updateURL(newFilters)
    }, [filters, updateURL])

    const statusOptions: { value: FilterStatus; label: string }[] = [
        { value: 'all', label: 'All Status' },
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'published', label: 'Published' }
    ]

    console.log('filter ', filters)


    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search posts..."
                        value={filters.search || ''}
                        onChange={(e) => handleChange('search', e.target.value || undefined)}
                        className="w-full pl-10 pr-4 py-2 border border-input rounded-md bg-background"
                    />
                </div>

                <div className="flex gap-2">
                    <select
                        value={filters.status || 'all'}
                        onChange={(e) => handleChange('status', e.target.value as FilterStatus)}
                        className="px-3 py-2 border border-input rounded-md bg-background"
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="px-3 py-2 border border-input rounded-md hover:bg-accent"
                        type="button"
                    >
                        <Filter className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {showAdvanced && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-border rounded-md bg-muted/30">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            From Date
                        </label>
                        <input
                            type="date"
                            value={filters.dateFrom || ''}
                            onChange={(e) => handleChange('dateFrom', e.target.value || undefined)}
                            className="w-full px-3 py-2 border border-input rounded-md bg-background"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            To Date
                        </label>
                        <input
                            type="date"
                            value={filters.dateTo || ''}
                            onChange={(e) => handleChange('dateTo', e.target.value || undefined)}
                            className="w-full px-3 py-2 border border-input rounded-md bg-background"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}