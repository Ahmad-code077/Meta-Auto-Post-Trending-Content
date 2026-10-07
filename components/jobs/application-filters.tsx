'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    buildListHref,
    hasActiveFilters,
    LIST_PATH,
    sanitizeSearch,
    SORT_DEFINITIONS,
    STATUS_DEFINITIONS,
    STATUS_FILTERS,
    SORT_KEYS,
    type ListQuery,
    type SortKey,
    type StatusFilter,
} from '@/lib/applications/list'
import type { FilterOptions } from '@/lib/data/applications'

const ALL = '__all__'
const SEARCH_DEBOUNCE_MS = 300

// Every control writes to the URL, so the view survives a refresh and can be shared. Search waits for a pause in typing.
export function ApplicationFilters({ query, options }: { query: ListQuery; options: FilterOptions }) {
    const router = useRouter()
    const [search, setSearch] = useState(query.q)

    useEffect(() => {
        const cleaned = sanitizeSearch(search)
        if (cleaned === query.q) return
        const timer = setTimeout(() => {
            router.replace(buildListHref(query, { q: cleaned }), { scroll: false })
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
        // The query is read from the URL; the effect only needs to re-run when the typed value changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search])

    const go = (changes: Partial<ListQuery>) => router.push(buildListHref(query, changes), { scroll: false })

    const clear = () => {
        setSearch('')
        router.push(LIST_PATH, { scroll: false })
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search company, role, or recruiter"
                        aria-label="Search applications"
                        maxLength={120}
                        className="pl-9"
                    />
                </div>

                <Select value={query.status} onValueChange={(value) => go({ status: value as StatusFilter })}>
                    <SelectTrigger className="w-full md:w-[220px]" aria-label="Filter by status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_FILTERS.map((value) => (
                            <SelectItem key={value} value={value}>{STATUS_DEFINITIONS[value].label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={query.sort} onValueChange={(value) => go({ sort: value as SortKey })}>
                    <SelectTrigger className="w-full md:w-[180px]" aria-label="Sort applications">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SORT_KEYS.map((value) => (
                            <SelectItem key={value} value={value}>{SORT_DEFINITIONS[value]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <OptionSelect label="Company" value={query.company} values={options.companies} onChange={(v) => go({ company: v })} />
                <OptionSelect label="Location" value={query.location} values={options.locations} onChange={(v) => go({ location: v })} />
                <OptionSelect label="Work type" value={query.work_type} values={options.workTypes} onChange={(v) => go({ work_type: v })} />
            </div>

            {hasActiveFilters(query) && (
                <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={clear}>
                        <X />
                        Clear filters
                    </Button>
                </div>
            )}
        </div>
    )
}

function OptionSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
    return (
        <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
            <SelectTrigger aria-label={`Filter by ${label.toLowerCase()}`}>
                <SelectValue placeholder={`All ${label.toLowerCase()}s`} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{`All ${label.toLowerCase()}s`}</SelectItem>
                {values.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
