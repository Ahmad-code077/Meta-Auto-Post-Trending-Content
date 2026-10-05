'use client';

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { sendJobEmail } from '@/app/actions/applications';
import { JobFilterBar } from '@/components/jobs/filter-bar';
import { JobDetailsDialog } from '@/components/jobs/job-details-dialog';
import { JobsTable } from '@/components/jobs/jobs-table';
import { JobsTableMobile } from '@/components/jobs/jobs-table-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { getJobs, getUniqueCompanies, getUniqueLocations, getUniqueWorkTypes } from '@/lib/data/jobs';
import type { Job, JobFilters, JobStatus } from '@/lib/types/jobs';

const PAGE_SIZE = 10;

export default function JobPostsPage() {
    const { toast } = useToast();

    const [jobs, setJobs] = useState<Job[]>([]);
    const [filters, setFilters] = useState<JobFilters>({});
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const [companies, setCompanies] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [workTypes, setWorkTypes] = useState<string[]>([]);

    const [sendingId, setSendingId] = useState<string | null>(null);
    const [sendTarget, setSendTarget] = useState<Job | null>(null);
    const [detailJob, setDetailJob] = useState<Job | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(() => {
        Promise.all([getUniqueCompanies(), getUniqueLocations(), getUniqueWorkTypes()])
            .then(([companiesData, locationsData, workTypesData]) => {
                setCompanies(companiesData);
                setLocations(locationsData);
                setWorkTypes(workTypesData);
            })
            .catch((error) => console.error('Error fetching filter options:', error));
    }, []);

    // Ignore responses from requests that a newer filter change has superseded.
    useEffect(() => {
        let current = true;
        setIsLoading(true);

        getJobs(filters, page, PAGE_SIZE)
            .then((result) => {
                if (!current) return;
                setJobs(result.data);
                setTotalPages(result.totalPages);
                setTotalCount(result.count);
                setLoadError(false);
            })
            .catch((error) => {
                if (!current) return;
                console.error('Error fetching jobs:', error);
                setLoadError(true);
                toast({ title: 'Could not load applications', description: 'Check your connection and try again.', variant: 'destructive' });
            })
            .finally(() => {
                if (current) setIsLoading(false);
            });

        return () => {
            current = false;
        };
    }, [filters, page, toast]);

    const handleFiltersChange = (next: JobFilters) => {
        setFilters(next);
        setPage(1);
    };

    const patchJob = useCallback((jobId: string, patch: Partial<Job>) => {
        setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
        setDetailJob((prev) => (prev && prev.id === jobId ? { ...prev, ...patch } : prev));
    }, []);

    // Optimistic: the row shows "Sent" right away and reverts if the webhook fails.
    const sendEmail = async (job: Job) => {
        const previous = { status: job.status, sent_at: job.sent_at };
        const optimisticStatus: JobStatus = 'sent';

        setSendingId(job.id);
        patchJob(job.id, { status: optimisticStatus, sent_at: new Date().toISOString() });

        try {
            const result = await sendJobEmail(job.id);

            if (result.success) {
                toast({ title: 'Email sent', description: `Sent to ${job.recruiter_email ?? 'the recruiter'}.` });
            } else {
                patchJob(job.id, previous);
                toast({ title: 'Email not sent', description: result.message, variant: 'destructive' });
            }
        } catch (error) {
            console.error('Error sending email:', error);
            patchJob(job.id, previous);
            toast({ title: 'Email not sent', description: 'An unexpected error occurred.', variant: 'destructive' });
        } finally {
            setSendingId(null);
        }
    };

    const requestSend = (job: Job) => {
        setDetailOpen(false);
        setSendTarget(job);
    };

    const openDetails = (job: Job) => {
        setDetailJob(job);
        setDetailOpen(true);
    };

    const showEmpty = !isLoading && !loadError && jobs.length === 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    {isLoading ? 'Loading applications' : `${totalCount} ${totalCount === 1 ? 'application' : 'applications'}`}
                </p>
                <Button asChild>
                    <Link href="/dashboard/job-posts/new">
                        <Plus />
                        New application
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Briefcase className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        <div>
                            <CardTitle>Applications</CardTitle>
                            <CardDescription>Drafts, sent emails and follow-ups</CardDescription>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <JobFilterBar
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                        companies={companies}
                        locations={locations}
                        workTypes={workTypes}
                    />

                    {isLoading && jobs.length === 0 ? (
                        <div className="flex h-48 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
                        </div>
                    ) : showEmpty ? (
                        <div className="py-16 text-center">
                            <p className="text-sm font-medium text-foreground">No applications match these filters</p>
                            <p className="mt-1 text-sm text-muted-foreground">Clear the filters or add a new application.</p>
                        </div>
                    ) : loadError && jobs.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm font-medium text-foreground">Applications could not be loaded</p>
                            <p className="mt-1 text-sm text-muted-foreground">Refresh the page to try again.</p>
                        </div>
                    ) : (
                        <>
                            <div className="hidden lg:block">
                                <JobsTable jobs={jobs} sendingId={sendingId} onView={openDetails} onSend={requestSend} />
                            </div>
                            <div className="lg:hidden">
                                <JobsTableMobile jobs={jobs} sendingId={sendingId} onView={openDetails} onSend={requestSend} />
                            </div>
                        </>
                    )}

                    {totalPages > 1 && (
                        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                            <p className="text-sm text-muted-foreground">
                                {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
                            </p>
                            <PageControls page={page} totalPages={totalPages} onChange={setPage} />
                        </div>
                    )}
                </CardContent>
            </Card>

            <JobDetailsDialog
                job={detailJob}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                onSend={requestSend}
            />

            <ConfirmDialog
                open={sendTarget !== null}
                onOpenChange={(open) => !open && setSendTarget(null)}
                title="Send this email?"
                description={
                    sendTarget
                        ? `The draft for ${sendTarget.title || 'this role'} will be sent to ${sendTarget.recruiter_email ?? 'the recruiter'}. Sent emails cannot be recalled from here.`
                        : ''
                }
                confirmLabel="Send email"
                onConfirm={() => {
                    const job = sendTarget;
                    setSendTarget(null);
                    if (job) void sendEmail(job);
                }}
            />
        </div>
    );
}

function PageControls({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    return (
        <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        onClick={() => page > 1 && onChange(page - 1)}
                        aria-disabled={page === 1}
                        className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                </PaginationItem>

                {start > 1 && (
                    <>
                        <PaginationItem>
                            <PaginationLink onClick={() => onChange(1)} className="cursor-pointer">1</PaginationLink>
                        </PaginationItem>
                        {start > 2 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                    </>
                )}

                {pages.map((p) => (
                    <PaginationItem key={p}>
                        <PaginationLink onClick={() => onChange(p)} isActive={p === page} className="cursor-pointer">
                            {p}
                        </PaginationLink>
                    </PaginationItem>
                ))}

                {end < totalPages && (
                    <>
                        {end < totalPages - 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                        <PaginationItem>
                            <PaginationLink onClick={() => onChange(totalPages)} className="cursor-pointer">{totalPages}</PaginationLink>
                        </PaginationItem>
                    </>
                )}

                <PaginationItem>
                    <PaginationNext
                        onClick={() => page < totalPages && onChange(page + 1)}
                        aria-disabled={page === totalPages}
                        className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
}
