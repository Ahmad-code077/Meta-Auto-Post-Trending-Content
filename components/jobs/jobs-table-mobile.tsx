'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Job, JobStatus } from '@/lib/types/jobs';
import { ExternalLink, Mail, Loader2, Eye, Building2, MapPin, Briefcase, Clock, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { JobDetailsDialog } from './job-details-dialog';

interface JobsTableMobileProps {
    jobs: Job[];
    isLoading?: boolean;
    onSendEmail: (jobId: string) => Promise<void>;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft_created: { label: 'Draft Created', variant: 'secondary' },
    sent: { label: 'Sent', variant: 'default' },
    follow_up_1: { label: 'Follow-up 1', variant: 'outline' },
    follow_up_2: { label: 'Follow-up 2', variant: 'outline' },
};

export function JobsTableMobile({ jobs, isLoading, onSendEmail }: JobsTableMobileProps) {
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
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
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
            <div className="space-y-4">
                {jobs.map((job) => (
                    <Card key={job.id} className="p-4 sm:p-5 hover:shadow-md transition-shadow">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-base sm:text-lg mb-1 truncate">
                                    {job.title || <span className="text-muted-foreground">Untitled Position</span>}
                                </h3>
                                {job.company && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Building2 className="w-4 h-4 shrink-0" />
                                        <span className="truncate">{job.company}</span>
                                    </div>
                                )}
                            </div>
                            <Badge variant={STATUS_CONFIG[job.status].variant} className="shrink-0">
                                {STATUS_CONFIG[job.status].label}
                            </Badge>
                        </div>

                        {/* Info Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm">
                            {job.location && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{job.location}</span>
                                </div>
                            )}
                            {job.work_type && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Briefcase className="w-4 h-4 shrink-0" />
                                    <span className="capitalize truncate">{job.work_type}</span>
                                </div>
                            )}
                            {job.experience && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <User className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{job.experience}</span>
                                </div>
                            )}
                            {job.timings && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Clock className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{job.timings}</span>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t">
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                            </span>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewDetails(job)}
                                    className="flex-1 sm:flex-none touch-manipulation"
                                >
                                    <Eye className="w-4 h-4 sm:mr-2" />
                                    <span className="hidden sm:inline">View</span>
                                </Button>

                                {job.gmail_message_id && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        asChild
                                        className="touch-manipulation"
                                    >
                                        <a
                                            href={`${job.status === 'draft_created' ? `https://mail.google.com/mail/#drafts?compose=${job.gmail_message_id}` : `https://mail.google.com/mail/u/0/#inbox/${job.gmail_message_id}`}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="View email draft"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </Button>
                                )}

                                {job.status === 'draft_created' && job.gmail_draft_id && (
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => handleSendEmail(job.id)}
                                        disabled={sendingEmailId === job.id}
                                        className="flex-1 sm:flex-none touch-manipulation min-w-[100px]"
                                    >
                                        {sendingEmailId === job.id ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Mail className="w-4 h-4 mr-2" />
                                                Send
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
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
