'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { JobFilters, JobStatus } from '@/lib/types/jobs';
import { Search, X } from 'lucide-react';

interface JobFilterBarProps {
    filters: JobFilters;
    onFiltersChange: (filters: JobFilters) => void;
    companies: string[];
    locations: string[];
    workTypes: string[];
}

const STATUS_OPTIONS: { value: JobStatus | 'all'; label: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }[] = [
    { value: 'all', label: 'All Statuses', variant: 'outline' },
    { value: 'draft_created', label: 'Draft Created', variant: 'secondary' },
    { value: 'sent', label: 'Sent', variant: 'default' },
    { value: 'follow_up_1', label: 'Follow-up 1', variant: 'outline' },
    { value: 'follow_up_2', label: 'Follow-up 2', variant: 'outline' },
];

export function JobFilterBar({
    filters,
    onFiltersChange,
    companies,
    locations,
    workTypes,
}: JobFilterBarProps) {
    const [searchValue, setSearchValue] = useState(filters.search || '');

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchValue !== filters.search) {
                onFiltersChange({ ...filters, search: searchValue || undefined });
            }
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchValue]);

    const handleStatusChange = (value: string) => {
        onFiltersChange({
            ...filters,
            status: value === 'all' ? undefined : (value as JobStatus),
        });
    };

    const handleCompanyChange = (value: string) => {
        onFiltersChange({
            ...filters,
            company: value === 'all' ? undefined : value,
        });
    };

    const handleLocationChange = (value: string) => {
        onFiltersChange({
            ...filters,
            location: value === 'all' ? undefined : value,
        });
    };

    const handleWorkTypeChange = (value: string) => {
        onFiltersChange({
            ...filters,
            work_type: value === 'all' ? undefined : value,
        });
    };

    const handleClearFilters = () => {
        setSearchValue('');
        onFiltersChange({});
    };

    const hasActiveFilters =
        filters.status ||
        filters.company ||
        filters.location ||
        filters.work_type ||
        filters.search;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search jobs by title, company, or location..."
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <Button
                        variant="outline"
                        onClick={handleClearFilters}
                        className="whitespace-nowrap"
                    >
                        <X className="mr-2 h-4 w-4" />
                        Clear Filters
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Status Filter */}
                <Select
                    value={filters.status || 'all'}
                    onValueChange={handleStatusChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Company Filter */}
                <Select
                    value={filters.company || 'all'}
                    onValueChange={handleCompanyChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by company" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Companies</SelectItem>
                        {companies.map((company) => (
                            <SelectItem key={company} value={company}>
                                {company}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Location Filter */}
                <Select
                    value={filters.location || 'all'}
                    onValueChange={handleLocationChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by location" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {locations.map((location) => (
                            <SelectItem key={location} value={location}>
                                {location}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Work Type Filter */}
                <Select
                    value={filters.work_type || 'all'}
                    onValueChange={handleWorkTypeChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by work type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Work Types</SelectItem>
                        {workTypes.map((workType) => (
                            <SelectItem key={workType} value={workType}>
                                {workType}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                    {filters.status && filters.status !== 'all' && (
                        <Badge variant="secondary">
                            Status: {STATUS_OPTIONS.find(s => s.value === filters.status)?.label}
                        </Badge>
                    )}
                    {filters.company && (
                        <Badge variant="secondary">
                            Company: {filters.company}
                        </Badge>
                    )}
                    {filters.location && (
                        <Badge variant="secondary">
                            Location: {filters.location}
                        </Badge>
                    )}
                    {filters.work_type && (
                        <Badge variant="secondary">
                            Work Type: {filters.work_type}
                        </Badge>
                    )}
                    {filters.search && (
                        <Badge variant="secondary">
                            Search: {filters.search}
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
