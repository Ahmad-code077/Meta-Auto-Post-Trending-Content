'use client'

import { Filters, FilterStatus } from '@/lib/types/posts'
import { Search, Filter, Calendar as CalendarIcon } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface FilterBarProps {
    initialFilters?: Filters
}

export default function FilterBar({ initialFilters }: FilterBarProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [filters, setFilters] = useState<Filters>(initialFilters || {})
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [dateFrom, setDateFrom] = useState<Date | undefined>(
        initialFilters?.dateFrom ? new Date(initialFilters.dateFrom) : undefined
    )
    const [dateTo, setDateTo] = useState<Date | undefined>(
        initialFilters?.dateTo ? new Date(initialFilters.dateTo) : undefined
    )

    const updateURL = useCallback((newFilters: Filters) => {
        const params = new URLSearchParams(searchParams.toString())

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

        params.delete('page')

        router.push(`${pathname}?${params.toString()}`)
        router.refresh()
    }, [router, pathname, searchParams])

    const handleChange = useCallback((key: keyof Filters, value: string | number | Date | undefined) => {
        let stringValue: string | undefined

        if (value instanceof Date) {
            stringValue = format(value, 'yyyy-MM-dd')
        } else if (typeof value === 'string') {
            stringValue = value
        } else if (typeof value === 'number') {
            stringValue = value.toString()
        }

        const newFilters = {
            ...filters,
            [key]: stringValue
        }

        setFilters(newFilters)
        updateURL(newFilters)
    }, [filters, updateURL])

    const handleDateFromChange = (date: Date | undefined) => {
        setDateFrom(date)
        handleChange('dateFrom', date)
    }

    const handleDateToChange = (date: Date | undefined) => {
        setDateTo(date)
        handleChange('dateTo', date)
    }

    const statusOptions: { value: FilterStatus; label: string }[] = [
        { value: 'all', label: 'All Status' },
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'published', label: 'Published' }
    ]

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                            <Input
                                type="text"
                                placeholder="Search posts by title or content..."
                                value={filters.search || ''}
                                onChange={(e) => handleChange('search', e.target.value || undefined)}
                                className="pl-10"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Select
                                value={filters.status || 'all'}
                                onValueChange={(value) => handleChange('status', value as FilterStatus)}
                            >
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {statusOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                variant="outline"
                                size="icon"
                                type="button"
                            >
                                <Filter className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {showAdvanced && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border border-border rounded-lg bg-muted/30">
                            <div className="space-y-3">
                                <Label htmlFor="date-from">From Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !dateFrom && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateFrom ? format(dateFrom, "PPP") : "Select start date"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={dateFrom}
                                            onSelect={handleDateFromChange}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="date-to">To Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full justify-start text-left font-normal",
                                                !dateTo && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateTo ? format(dateTo, "PPP") : "Select end date"}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={dateTo}
                                            onSelect={handleDateToChange}
                                            initialFocus
                                            disabled={(date) => dateFrom ? date < dateFrom : false}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}