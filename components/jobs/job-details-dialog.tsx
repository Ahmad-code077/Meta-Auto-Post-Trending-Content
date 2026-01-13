'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Job, JobStatus } from '@/lib/types/jobs';
import { ExternalLink, Mail, Calendar, User, Building2, MapPin, Briefcase, Clock, Code, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface JobDetailsDialogProps {
    job: Job | null;
    isOpen: boolean;
    onClose: () => void;
    onSendEmail?: (jobId: string) => Promise<void>;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft_created: { label: 'Draft Created', variant: 'secondary' },
    sent: { label: 'Sent', variant: 'default' },
    follow_up_1: { label: 'Follow-up 1', variant: 'outline' },
    follow_up_2: { label: 'Follow-up 2', variant: 'outline' },
};

export function JobDetailsDialog({ job, isOpen, onClose, onSendEmail }: JobDetailsDialogProps) {
    if (!job) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <DialogTitle className="text-2xl font-bold mb-2">
                                {job.title || 'Untitled Position'}
                            </DialogTitle>
                            <DialogDescription className="text-base">
                                {job.company && (
                                    <span className="font-semibold text-foreground">{job.company}</span>
                                )}
                            </DialogDescription>
                        </div>
                        <Badge variant={STATUS_CONFIG[job.status].variant} className="text-sm px-3 py-1">
                            {STATUS_CONFIG[job.status].label}
                        </Badge>
                    </div>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Basic Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Company */}
                        {job.company && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Company</p>
                                    <p className="text-base font-semibold">{job.company}</p>
                                </div>
                            </div>
                        )}

                        {/* Location */}
                        {job.location && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                                    <p className="text-base font-semibold">{job.location}</p>
                                </div>
                            </div>
                        )}

                        {/* Work Type */}
                        {job.work_type && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Work Type</p>
                                    <p className="text-base font-semibold capitalize">{job.work_type}</p>
                                </div>
                            </div>
                        )}

                        {/* Experience */}
                        {job.experience && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Experience</p>
                                    <p className="text-base font-semibold">{job.experience}</p>
                                </div>
                            </div>
                        )}

                        {/* Timings */}
                        {job.timings && (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Timings</p>
                                    <p className="text-base font-semibold">{job.timings}</p>
                                </div>
                            </div>
                        )}

                        {/* Created At */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Posted</p>
                                <p className="text-base font-semibold">
                                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {format(new Date(job.created_at), 'PPP')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Recruiter Information */}
                    {(job.recruiter_name || job.recruiter_email) && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Recruiter Information
                            </h3>
                            <div className="space-y-2">
                                {job.recruiter_name && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Name</p>
                                        <p className="text-base font-medium">{job.recruiter_name}</p>
                                    </div>
                                )}
                                {job.recruiter_email && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Email</p>
                                        <p className="text-base font-medium">{job.recruiter_email}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Skills */}
                    {job.skills && job.skills.length > 0 && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <Code className="h-5 w-5" />
                                Required Skills
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {job.skills.map((skill, index) => (
                                    <Badge key={index} variant="outline" className="text-sm">
                                        {skill}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Raw Post */}
                    {job.raw_post && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                Original Job Post
                            </h3>
                            <div className="prose prose-sm max-w-none">
                                <pre className="whitespace-pre-wrap text-sm bg-background p-4 rounded border overflow-x-auto">
                                    {job.raw_post}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* Email Status */}
                    {(job.sent_at || job.follow_up_date || job.email_draft_link) && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <Mail className="h-5 w-5" />
                                Email Status
                            </h3>
                            <div className="space-y-3">
                                {job.sent_at && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Sent At</p>
                                        <p className="text-base font-medium">
                                            {format(new Date(job.sent_at), 'PPP p')}
                                        </p>
                                    </div>
                                )}
                                {job.follow_up_date && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Follow-up Scheduled</p>
                                        <p className="text-base font-medium">
                                            {format(new Date(job.follow_up_date), 'PPP')}
                                        </p>
                                    </div>
                                )}
                                {job.follow_up_count > 0 && (
                                    <div>
                                        <p className="text-sm text-muted-foreground">Follow-up Count</p>
                                        <p className="text-base font-medium">{job.follow_up_count}</p>
                                    </div>
                                )}
                                {job.email_draft_link && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-2">Email Draft</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                        >
                                            <a
                                                href={`https://mail.google.com/mail/u/0/#drafts?compose=${job.email_draft_link}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                View Draft
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t">
                        {job.status === 'draft_created' && job.email_draft_link && onSendEmail && (
                            <Button
                                onClick={() => {
                                    onSendEmail(job.id);
                                    onClose();
                                }}
                                className="gap-2"
                            >
                                <Mail className="h-4 w-4" />
                                Send Email
                            </Button>
                        )}
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
