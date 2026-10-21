'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { canSendDraft, type ApplicationCard } from '@/lib/dashboard/command-center';
import type { Job } from '@/lib/types/jobs';
import { STATUS_CONFIG } from './job-meta';

interface JobDetailsDialogProps {
    job: Job | null;
    card: ApplicationCard | null;
    open: boolean;
    onClose: () => void;
    onSend: (job: Job) => void;
}

export function JobDetailsDialog({ job, card, open, onClose, onSend }: JobDetailsDialogProps) {
    if (!job) return null;

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <div className="flex items-start justify-between gap-4 pr-6">
                        <div className="min-w-0">
                            <DialogTitle className="text-xl">{job.title || 'Untitled role'}</DialogTitle>
                            <DialogDescription className="mt-1">
                                {job.company || 'Company not set'}
                            </DialogDescription>
                        </div>
                        <Badge variant={STATUS_CONFIG[job.status].variant} className="shrink-0">
                            {STATUS_CONFIG[job.status].label}
                        </Badge>
                    </div>
                </DialogHeader>

                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                    <Field label="Location">{job.location}</Field>
                    <Field label="Work type" className="capitalize">{job.work_type}</Field>
                    <Field label="Experience">{job.experience}</Field>
                    <Field label="Timings">{job.timings}</Field>
                    <Field label="Recruiter">
                        {job.recruiter_name || job.recruiter_email ? (
                            <>
                                {job.recruiter_name && <div>{job.recruiter_name}</div>}
                                {job.recruiter_email && <div className="text-muted-foreground">{job.recruiter_email}</div>}
                            </>
                        ) : null}
                    </Field>
                    <Field label="Added">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                        <span className="block text-xs text-muted-foreground">{format(new Date(job.created_at), 'PPP')}</span>
                    </Field>
                    {job.sent_at && (
                        <Field label="Sent">{format(new Date(job.sent_at), 'PPP p')}</Field>
                    )}
                    {job.follow_up_date && (
                        <Field label="Follow-up scheduled">{format(new Date(job.follow_up_date), 'PPP')}</Field>
                    )}
                </dl>

                {job.skills && job.skills.length > 0 && (
                    <section className="space-y-2">
                        <h3 className="text-sm font-medium">Skills</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {job.skills.map((skill) => (
                                <Badge key={skill} variant="outline">{skill}</Badge>
                            ))}
                        </div>
                    </section>
                )}

                {job.raw_post && (
                    <section className="space-y-2">
                        <h3 className="text-sm font-medium">Original post</h3>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm text-foreground">
                            {job.raw_post}
                        </pre>
                    </section>
                )}

                <DialogFooter className="gap-2 border-t pt-4">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button variant="outline" asChild onClick={onClose}>
                        <Link href={`/dashboard/job-posts/${job.id}`}>Review draft</Link>
                    </Button>
                    {card && canSendDraft(card) && (
                        <Button onClick={() => onSend(job)}>
                            <Mail />
                            Send email
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    const hasValue = children !== null && children !== undefined && children !== '' && children !== false;

    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className={`mt-1 text-foreground ${className ?? ''}`}>
                {hasValue ? children : <span className="text-muted-foreground">Not set</span>}
            </dd>
        </div>
    );
}
