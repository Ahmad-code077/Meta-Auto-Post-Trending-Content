'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarDays, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// All filter state lives in the URL, so views can be shared and back/forward works.
// The search box keeps local state and writes to the URL after a short pause.

const STATUS_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'published', label: 'Published' },
]

export default function FilterBar() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const status = searchParams.get('status') ?? 'all'
    const urlSearch = searchParams.get('search') ?? ''
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const [search, setSearch] = useState(urlSearch)

    const updateParams = useCallback((changes: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString())
        for (const [key, value] of Object.entries(changes)) {
            if (value) params.set(key, value)
            else params.delete(key)
        }
        params.delete('page')
        const query = params.toString()
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }, [router, pathname, searchParams])

    useEffect(() => {
        if (search === urlSearch) return
        const timer = setTimeout(() => {
            updateParams({ search: search.trim() || null })
        }, 300)
        return () => clearTimeout(timer)
    }, [search, urlSearch, updateParams])

    const hasFilters = status !== 'all' || urlSearch !== '' || dateFrom !== null || dateTo !== null

    const clearAll = () => {
        setSearch('')
        router.replace(pathname, { scroll: false })
    }

    return (
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by title or content"
                    aria-label="Search posts"
                    className="pl-9"
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Select value={status} onValueChange={(value) => updateParams({ status: value === 'all' ? null : value })}>
                    <SelectTrigger className="w-[160px]" aria-label="Filter by status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <DatePickerField
                    label="From"
                    value={dateFrom}
                    onChange={(value) => updateParams({ dateFrom: value })}
                />
                <DatePickerField
                    label="To"
                    value={dateTo}
                    onChange={(value) => updateParams({ dateTo: value })}
                />

                {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={clearAll}>
                        <X />
                        Clear
                    </Button>
                )}
            </div>
        </div>
    )
}

function DatePickerField({
    label,
    value,
    onChange,
}: {
    label: string
    value: string | null
    onChange: (value: string | null) => void
}) {
    const [open, setOpen] = useState(false)
    const selected = value ? new Date(`${value}T00:00:00`) : undefined

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="default"
                    className={cn('justify-start font-normal', !value && 'text-muted-foreground')}
                    aria-label={`${label} date`}
                >
                    <CalendarDays />
                    {value ? `${label} ${format(selected!, 'MMM d, yyyy')}` : `${label} date`}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    onSelect={(date) => {
                        onChange(date ? format(date, 'yyyy-MM-dd') : null)
                        setOpen(false)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}
