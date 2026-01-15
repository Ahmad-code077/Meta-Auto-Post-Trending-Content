'use client';

import { useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Job } from '@/lib/types/jobs';
import { ExternalLink, Mail, Loader2, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { JobDetailsDialog, STATUS_CONFIG } from './job-details-dialog';
import { JobsTableMobile } from './jobs-table-mobile';

interface JobsTableProps {
    jobs: Job[];
    isLoading?: boolean;
    onSendEmail: (jobId: string) => Promise<void>;
}

export function JobsTable({ jobs, isLoading, onSendEmail }: JobsTableProps) {
    const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleSendEmail = async (jobId: string) => {
        setSendingEmailId(jobId);
        try {
            await onSendEmail(jobId);
        } finally {
            setSendingEmailId(null);
        }
    };

    const handleViewDetails = (job: Job) => {
        setSelectedJob(job);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setSelectedJob(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!jobs || jobs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="text-muted-foreground mb-2">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-16 w-16 mx-auto mb-4 opacity-50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                    </svg>
                    <h3 className="text-lg font-semibold mb-1">No jobs found</h3>
                    <p className="text-sm">
                        Try adjusting your filters or create a new job post
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Mobile view */}
            <div className="block lg:hidden">
                <JobsTableMobile
                    jobs={jobs}
                    isLoading={isLoading}
                    onSendEmail={handleSendEmail}
                />
            </div>

            {/* Desktop view */}
            <div className="hidden lg:block rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Company</TableHead>
                            <TableHead>Recruiter</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Experience</TableHead>
                            <TableHead>Work Type</TableHead>
                            <TableHead>Timings</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {jobs.map((job) => (
                            <TableRow key={job.id}>
                                <TableCell className="font-medium max-w-[200px]">
                                    <div className="truncate" title={job.title || 'N/A'}>
                                        {job.title || <span className="text-muted-foreground">N/A</span>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {job.company || <span className="text-muted-foreground">N/A</span>}
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <div className="text-sm">
                                            {job.recruiter_name || <span className="text-muted-foreground">N/A</span>}
                                        </div>
                                        {job.recruiter_email && (
                                            <div className="text-xs text-muted-foreground">
                                                {job.recruiter_email}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {job.location || <span className="text-muted-foreground">N/A</span>}
                                </TableCell>
                                <TableCell>
                                    {job.experience || <span className="text-muted-foreground">N/A</span>}
                                </TableCell>
                                <TableCell>
                                    {job.work_type ? (
                                        <Badge variant="outline" className="capitalize">
                                            {job.work_type}
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground">N/A</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {job.timings || <span className="text-muted-foreground">N/A</span>}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={STATUS_CONFIG[job.status].variant}>
                                        {STATUS_CONFIG[job.status].label}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleViewDetails(job)}
                                            title="View full details"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                        {job.gmail_message_id && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                asChild
                                            >
                                                <a
                                                    href={`${job.status === 'draft_created' ? `https://mail.google.com/mail/#drafts?compose=${job.gmail_message_id}` : `https://mail.google.com/mail/u/0/#inbox/${job.gmail_message_id}`}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="View email draft"
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            </Button>
                                        )}
                                        {job.status === 'draft_created' && job.gmail_draft_id && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={() => handleSendEmail(job.id)}
                                                disabled={sendingEmailId === job.id}
                                            >
                                                {sendingEmailId === job.id ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Sending...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Mail className="mr-2 h-4 w-4" />
                                                        Send Email
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <JobDetailsDialog
                job={selectedJob}
                isOpen={isDialogOpen}
                onClose={handleCloseDialog}
                onSendEmail={handleSendEmail}
            />
        </>
    );
}
