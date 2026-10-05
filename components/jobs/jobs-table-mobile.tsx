'use client';

import { formatDistanceToNow } from 'date-fns';
import { Briefcase, Building2, Clock, ExternalLink, Eye, Loader2, Mail, MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Job } from '@/lib/types/jobs';
import { canSendEmail, gmailUrl, STATUS_CONFIG } from './job-meta';

interface JobsTableMobileProps {
    jobs: Job[];
    sendingId: string | null;
    onView: (job: Job) => void;
    onSend: (job: Job) => void;
}

// Card list for small screens. Same data and actions as JobsTable.
export function JobsTableMobile({ jobs, sendingId, onView, onSend }: JobsTableMobileProps) {
    return (
        <div className="space-y-3">
            {jobs.map((job) => {
                const emailUrl = gmailUrl(job);
                const isSending = sendingId === job.id;

                return (
                    <Card key={job.id} className="gap-4 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <button
                                    type="button"
                                    onClick={() => onView(job)}
                                    className="block truncate text-left font-medium hover:underline"
                                >
                                    {job.title || 'Untitled role'}
                                </button>
                                {job.company && (
                                    <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{job.company}</span>
                                    </div>
                                )}
                            </div>
                            <Badge variant={STATUS_CONFIG[job.status].variant} className="shrink-0">
                                {STATUS_CONFIG[job.status].label}
                            </Badge>
                        </div>

                        <dl className="grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                            {job.location && <Detail icon={MapPin}>{job.location}</Detail>}
                            {job.work_type && <Detail icon={Briefcase}><span className="capitalize">{job.work_type}</span></Detail>}
                            {job.experience && <Detail icon={User}>{job.experience}</Detail>}
                            {job.timings && <Detail icon={Clock}>{job.timings}</Detail>}
                        </dl>

                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                            </span>
                            <div className="flex items-center gap-1">
                                {emailUrl && (
                                    <Button variant="ghost" size="icon" asChild>
                                        <a href={emailUrl} target="_blank" rel="noopener noreferrer" aria-label="Open email in Gmail">
                                            <ExternalLink />
                                        </a>
                                    </Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => onView(job)}>
                                    <Eye />
                                    View
                                </Button>
                                {canSendEmail(job) && (
                                    <Button size="sm" onClick={() => onSend(job)} disabled={isSending}>
                                        {isSending ? <Loader2 className="animate-spin" /> : <Mail />}
                                        {isSending ? 'Sending' : 'Send'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}

function Detail({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <dd className="truncate">{children}</dd>
        </div>
    );
}
