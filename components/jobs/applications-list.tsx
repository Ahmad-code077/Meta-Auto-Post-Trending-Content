'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ExternalLink, Eye, Loader2, Mail, Plus } from 'lucide-react'
import { sendJobEmail } from '@/app/actions/applications'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { buildListHref, hasActiveFilters, LIST_PATH, type ListQuery } from '@/lib/applications/list'
import type { ApplicationsPage } from '@/lib/data/applications'
import { nextActionLabel, type ApplicationCard } from '@/lib/dashboard/command-center'
import type { Job } from '@/lib/types/jobs'
import { cn } from '@/lib/utils'
import { JobDetailsDialog } from './job-details-dialog'
import { STATUS_CONFIG, gmailUrl, canSendEmail, isAwaitingReply } from './job-meta'

interface ApplicationsListProps {
    page: ApplicationsPage
    query: ListQuery
}

// Presentational list with the existing send, details and Gmail actions. Filtering, sorting and paging
// are done on the server and reached through the URL.
export function ApplicationsList({ page, query }: ApplicationsListProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [sendTarget, setSendTarget] = useState<Job | null>(null)
    const [detail, setDetail] = useState<{ job: Job; open: boolean } | null>(null)
    const [sendingId, setSendingId] = useState<string | null>(null)
    const [isSending, startSending] = useTransition()

    const send = (job: Job) => {
        setSendingId(job.id)
        startSending(async () => {
            const result = await sendJobEmail(job.id)
            setSendingId(null)
            if (result.success) {
                toast({ title: 'Email sent', description: `Sent to ${job.recruiter_email ?? 'the recruiter'}.` })
                router.refresh()
            } else {
                toast({ title: 'Email not sent', description: result.message, variant: 'destructive' })
            }
        })
    }

    const requestSend = (job: Job) => {
        setDetail(null)
        setSendTarget(job)
    }

    const summary = page.total === 1 ? '1 application' : `${page.total} applications`

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                    {summary}
                    {page.truncated && ' (showing the first matches; narrow the search to see the rest)'}
                </p>
                <Button asChild size="sm">
                    <Link href="/dashboard/job-posts/new">
                        <Plus />
                        New application
                    </Link>
                </Button>
            </div>

            {page.total === 0 ? (
                <EmptyState filtered={hasActiveFilters(query)} />
            ) : (
                <>
                    <div className="hidden overflow-hidden rounded-md border lg:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="min-w-[180px]">Company</TableHead>
                                    <TableHead className="min-w-[160px]">Role</TableHead>
                                    <TableHead className="min-w-[160px]">Recruiter</TableHead>
                                    <TableHead className="min-w-[170px]">Status</TableHead>
                                    <TableHead>Sent</TableHead>
                                    <TableHead>Next follow-up</TableHead>
                                    <TableHead className="min-w-[180px]">Next action</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {page.rows.map(({ job, card }) => (
                                    <TableRow key={job.id}>
                                        <TableCell className="font-medium">
                                            <Link href={reviewHref(job)} className="hover:underline">{job.company || 'Company not set'}</Link>
                                        </TableCell>
                                        <TableCell>{job.title || 'Untitled role'}</TableCell>
                                        <TableCell className="text-sm">{recruiterText(job)}</TableCell>
                                        <TableCell><StatusCell job={job} card={card} /></TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{card.sentAt ? format(new Date(card.sentAt), 'PPP p') : 'Not sent'}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">{card.nextFollowUp ? format(new Date(card.nextFollowUp.dueAt), 'PPP p') : 'None'}</TableCell>
                                        <TableCell className={cn('text-sm', card.nextAction.attention ? 'font-medium text-primary' : 'text-muted-foreground')}>
                                            {nextActionLabel(card.nextAction)}
                                        </TableCell>
                                        <TableCell>
                                            <Actions job={job} sending={sendingId === job.id} onView={() => setDetail({ job, open: true })} onSend={requestSend} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="space-y-3 lg:hidden">
                        {page.rows.map(({ job, card }) => (
                            <Card key={job.id} className="gap-4 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link href={reviewHref(job)} className="block truncate font-medium hover:underline">
                                            {job.company || 'Company not set'}
                                        </Link>
                                        <p className="truncate text-sm text-muted-foreground">{job.title || 'Untitled role'}</p>
                                    </div>
                                    <StatusCell job={job} card={card} align="end" />
                                </div>

                                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                    {(job.recruiter_name || job.recruiter_email) && (
                                        <div className="min-w-0">
                                            <dt className="text-xs text-muted-foreground">Recruiter</dt>
                                            <dd className="truncate">{job.recruiter_name || job.recruiter_email}</dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt className="text-xs text-muted-foreground">Sent</dt>
                                        <dd>{card.sentAt ? format(new Date(card.sentAt), 'PPP p') : 'Not sent'}</dd>
                                    </div>
                                    {card.nextFollowUp && (
                                        <div>
                                            <dt className="text-xs text-muted-foreground">Next follow-up</dt>
                                            <dd>{format(new Date(card.nextFollowUp.dueAt), 'PPP p')}</dd>
                                        </div>
                                    )}
                                </dl>

                                <div className="flex items-center justify-between gap-3 border-t pt-3">
                                    <span className={cn('text-sm', card.nextAction.attention ? 'font-medium text-primary' : 'text-muted-foreground')}>
                                        {nextActionLabel(card.nextAction)}
                                    </span>
                                    <Actions job={job} sending={sendingId === job.id} onView={() => setDetail({ job, open: true })} onSend={requestSend} />
                                </div>
                            </Card>
                        ))}
                    </div>

                    {page.totalPages > 1 && <Pagination page={page} query={query} />}
                </>
            )}

            <JobDetailsDialog
                job={detail?.job ?? null}
                open={detail?.open ?? false}
                onClose={() => setDetail(null)}
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
                    const job = sendTarget
                    setSendTarget(null)
                    if (job && !isSending) send(job)
                }}
            />
        </div>
    )
}

function reviewHref(job: Pick<Job, 'id'>) {
    return `${LIST_PATH}/${job.id}`
}

function recruiterText(job: Pick<Job, 'recruiter_name' | 'recruiter_email'>) {
    if (!job.recruiter_name && !job.recruiter_email) return <span className="text-muted-foreground">Not set</span>
    return (
        <>
            {job.recruiter_name && <div>{job.recruiter_name}</div>}
            {job.recruiter_email && <div className="break-all text-xs text-muted-foreground">{job.recruiter_email}</div>}
        </>
    )
}

// The status, with the awaiting note and the reply date where they apply. An awaiting application stays
// "awaiting" even when a follow-up is scheduled, which is shown as the next action.
function StatusCell({ job, card, align = 'start' }: { job: Job; card: ApplicationCard; align?: 'start' | 'end' }) {
    const config = STATUS_CONFIG[job.status]
    return (
        <div className={cn('flex flex-col gap-1', align === 'end' && 'items-end')}>
            <Badge variant={config?.variant ?? 'outline'} className="w-fit">{config?.label ?? job.status}</Badge>
            {isAwaitingReply(job.status) && <span className="text-xs text-muted-foreground">Awaiting recruiter reply</span>}
            {card.repliedAt && <span className="text-xs text-muted-foreground">Replied {format(new Date(card.repliedAt), 'PPP p')}</span>}
        </div>
    )
}

function Actions({ job, sending, onView, onSend }: { job: Job; sending: boolean; onView: () => void; onSend: (job: Job) => void }) {
    const emailUrl = gmailUrl(job)
    return (
        <div className="flex items-center justify-end gap-1">
            {emailUrl && (
                <Button variant="ghost" size="icon" asChild>
                    <a href={emailUrl} target="_blank" rel="noopener noreferrer" aria-label="Open email in Gmail" title="Open in Gmail">
                        <ExternalLink />
                    </a>
                </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onView} aria-label="View details" title="View details">
                <Eye />
            </Button>
            {canSendEmail(job) && (
                <Button size="sm" onClick={() => onSend(job)} disabled={sending}>
                    {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                    {sending ? 'Sending' : 'Send'}
                </Button>
            )}
        </div>
    )
}

function Pagination({ page, query }: { page: ApplicationsPage; query: ListQuery }) {
    const href = (target: number) => buildListHref(query, { page: target })
    const disabledClass = 'pointer-events-none opacity-50'

    return (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
            <Link
                href={href(page.page - 1)}
                scroll={false}
                aria-disabled={page.page <= 1}
                tabIndex={page.page <= 1 ? -1 : undefined}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), page.page <= 1 && disabledClass)}
            >
                Previous
            </Link>
            <span className="text-sm text-muted-foreground tabular-nums">Page {page.page} of {page.totalPages}</span>
            <Link
                href={href(page.page + 1)}
                scroll={false}
                aria-disabled={page.page >= page.totalPages}
                tabIndex={page.page >= page.totalPages ? -1 : undefined}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), page.page >= page.totalPages && disabledClass)}
            >
                Next
            </Link>
        </nav>
    )
}

function EmptyState({ filtered }: { filtered: boolean }) {
    if (filtered) {
        return (
            <div className="py-16 text-center">
                <p className="text-sm font-medium text-foreground">No applications match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a different search, or clear the filters to see everything.</p>
                <Link href={LIST_PATH} className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
                    Clear filters
                </Link>
            </div>
        )
    }
    return (
        <div className="py-16 text-center">
            <p className="text-sm font-medium text-foreground">No applications yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Paste a job posting to create your first application.</p>
        </div>
    )
}

