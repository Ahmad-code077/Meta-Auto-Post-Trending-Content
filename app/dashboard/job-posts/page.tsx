'use client';

import { useState, useEffect } from 'react';
import { JobFilterBar } from '@/components/jobs/filter-bar';
import { JobsTable } from '@/components/jobs/jobs-table';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Job, JobFilters } from '@/lib/types/jobs';
import { sendJobEmail } from '@/app/actions/jobs';
import { useToast } from '@/hooks/use-toast';
import { Briefcase } from 'lucide-react';
import { getJobs, getUniqueCompanies, getUniqueLocations, getUniqueWorkTypes } from '@/lib/data/jobs';

export default function JobPostsPage() {
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [filters, setFilters] = useState<JobFilters>({});
    const [companies, setCompanies] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [workTypes, setWorkTypes] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    const pageSize = 10;

    // Fetch filter options
    useEffect(() => {
        const fetchFilterOptions = async () => {
            try {
                const [companiesData, locationsData, workTypesData] = await Promise.all([
                    getUniqueCompanies(),
                    getUniqueLocations(),
                    getUniqueWorkTypes(),
                ]);

                setCompanies(companiesData);
                setLocations(locationsData);
                setWorkTypes(workTypesData);
            } catch (error) {
                console.error('Error fetching filter options:', error);
            }
        };

        fetchFilterOptions();
    }, []);

    // Fetch jobs
    useEffect(() => {
        const fetchJobs = async () => {
            setIsLoading(true);
            try {
                const result = await getJobs(filters, page, pageSize);

                setJobs(result.data);
                setTotalPages(result.totalPages);
                setTotalCount(result.count);
            } catch (error) {
                console.error('Error fetching jobs:', error);
                toast({
                    title: 'Error',
                    description: 'Failed to load jobs. Please try again.',
                    variant: 'destructive',
                });
            } finally {
                setIsLoading(false);
                setIsInitialLoad(false);
            }
        };

        fetchJobs();
    }, [filters, page, toast]);
    const handleFiltersChange = (newFilters: JobFilters) => {
        setFilters(newFilters);
        setPage(1); // Reset to first page when filters change
    };

    const handleSendEmail = async (jobId: string) => {
        try {
            const result = await sendJobEmail(jobId);

            if (result.success) {
                toast({
                    title: 'Success',
                    description: result.message,
                });

                // Refresh the jobs list
                const updatedResult = await getJobs(filters, page, pageSize);
                setJobs(updatedResult.data);
            } else {
                toast({
                    title: 'Error',
                    description: result.message,
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error('Error sending email:', error);
            toast({
                title: 'Error',
                description: 'An unexpected error occurred while sending the email.',
                variant: 'destructive',
            });
        }
    };

    const renderPagination = () => {
        if (totalPages <= 1) return null;

        const pages: number[] = [];
        const maxVisiblePages = 5;

        let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
        const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        return (
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            onClick={() => page > 1 && setPage(page - 1)}
                            className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                    </PaginationItem>

                    {startPage > 1 && (
                        <>
                            <PaginationItem>
                                <PaginationLink onClick={() => setPage(1)} className="cursor-pointer">
                                    1
                                </PaginationLink>
                            </PaginationItem>
                            {startPage > 2 && (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            )}
                        </>
                    )}

                    {pages.map((pageNum) => (
                        <PaginationItem key={pageNum}>
                            <PaginationLink
                                onClick={() => setPage(pageNum)}
                                isActive={pageNum === page}
                                className="cursor-pointer"
                            >
                                {pageNum}
                            </PaginationLink>
                        </PaginationItem>
                    ))}

                    {endPage < totalPages && (
                        <>
                            {endPage < totalPages - 1 && (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            )}
                            <PaginationItem>
                                <PaginationLink onClick={() => setPage(totalPages)} className="cursor-pointer">
                                    {totalPages}
                                </PaginationLink>
                            </PaginationItem>
                        </>
                    )}

                    <PaginationItem>
                        <PaginationNext
                            onClick={() => page < totalPages && setPage(page + 1)}
                            className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        );
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Briefcase className="h-6 w-6" />
                        <div>
                            <CardTitle>Job Posts Management</CardTitle>
                            <CardDescription>
                                Manage and track your job applications
                                {!isInitialLoad && totalCount > 0 && (
                                    <span className="ml-2">
                                        • {totalCount} {totalCount === 1 ? 'job' : 'jobs'} found
                                    </span>
                                )}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Filters */}
                    <JobFilterBar
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        companies={companies}
                        locations={locations}
                        workTypes={workTypes}
                    />

                    {/* Table */}
                    <JobsTable
                        jobs={jobs}
                        isLoading={isLoading}
                        onSendEmail={handleSendEmail}
                    />

                    {/* Pagination */}
                    {!isLoading && jobs.length > 0 && (
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} jobs
                            </p>
                            {renderPagination()}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}