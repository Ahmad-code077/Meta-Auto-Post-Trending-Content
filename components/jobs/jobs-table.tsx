'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { ExternalLink, Eye, Loader2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Job } from '@/lib/types/jobs';
import { canSendEmail, gmailUrl, STATUS_CONFIG } from './job-meta';

interface JobsTableProps {
    jobs: Job[];
    sendingId: string | null;
    onView: (job: Job) => void;
    onSend: (job: Job) => void;
}

// Desktop table. The mobile card list is in jobs-table-mobile.tsx.
export function JobsTable({ jobs, sendingId, onView, onSend }: JobsTableProps) {
    return (
        <div className="overflow-hidden rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[200px]">Role</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="min-w-[180px]">Recruiter</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Work type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {jobs.map((job) => {
                        const emailUrl = gmailUrl(job);
                        const isSending = sendingId === job.id;

                        return (
                            <TableRow key={job.id}>
                                <TableCell className="font-medium">
                                    <button
                                        type="button"
                                        onClick={() => onView(job)}
                                        className="text-left hover:underline"
                                    >
                                        {job.title || 'Untitled role'}
                                    </button>
                                </TableCell>
                                <TableCell>{job.company || <Muted>Not set</Muted>}</TableCell>
                                <TableCell>
                                    <div className="text-sm">{job.recruiter_name || <Muted>Not set</Muted>}</div>
                                    {job.recruiter_email && (
                                        <div className="text-xs text-muted-foreground">{job.recruiter_email}</div>
                                    )}
                                </TableCell>
                                <TableCell>{job.location || <Muted>Not set</Muted>}</TableCell>
                                <TableCell>
                                    {job.work_type ? (
                                        <Badge variant="outline" className="capitalize">{job.work_type}</Badge>
                                    ) : (
                                        <Muted>Not set</Muted>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={STATUS_CONFIG[job.status].variant}>
                                        {STATUS_CONFIG[job.status].label}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground" title={format(new Date(job.created_at), 'PPP')}>
                                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                        {emailUrl && (
                                            <Button variant="ghost" size="icon" asChild>
                                                <a href={emailUrl} target="_blank" rel="noopener noreferrer" aria-label="Open email in Gmail" title="Open in Gmail">
                                                    <ExternalLink />
                                                </a>
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => onView(job)} aria-label="View details" title="View details">
                                            <Eye />
                                        </Button>
                                        {canSendEmail(job) && (
                                            <Button size="sm" onClick={() => onSend(job)} disabled={isSending}>
                                                {isSending ? <Loader2 className="animate-spin" /> : <Mail />}
                                                {isSending ? 'Sending' : 'Send'}
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

function Muted({ children }: { children: React.ReactNode }) {
    return <span className="text-muted-foreground">{children}</span>;
}
