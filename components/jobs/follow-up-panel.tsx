'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { format } from 'date-fns'
import { CalendarClock, Loader2 } from 'lucide-react'
import { cancelFollowUp, rescheduleFollowUp, retryFollowUp } from '@/app/actions/followups'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { isSafeToRetry } from '@/lib/followups/manage'
import { awaitingReply } from '@/lib/followups/policy'
import { followUpTimeZone, sendWindowLabel } from '@/lib/followups/schedule'
import { cancellationReason, failureReason } from '@/lib/followups/messages'
import { STATUS_BADGE } from './job-meta'

export interface FollowUpView {
    id: string
    number: number
    status: string
    dueAt: string | null
    sentAt: string | null
    claimedAt: string | null
    attempts: number
    errorCode: string | null
}

interface FollowUpPanelProps {
    jobId: string
    jobStatus: string
    followUps: FollowUpView[]
}

export function FollowUpPanel({ jobId, jobStatus, followUps }: FollowUpPanelProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Follow-up</CardTitle>
                <CardDescription>
                    Follow-ups are written and sent automatically when they are due, unless you cancel them.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {followUps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {jobStatus === 'sent'
                            ? 'Follow-up 1 is scheduled automatically 7 days after the application is sent.'
                            : 'Follow-ups appear here after the application is sent.'}
                    </p>
                ) : (
                    followUps.map((followUp) => (
                        <FollowUpItem key={followUp.id} jobId={jobId} jobStatus={jobStatus} followUp={followUp} />
                    ))
                )}
            </CardContent>
        </Card>
    )
}

function FollowUpItem({ jobId, jobStatus, followUp }: { jobId: string; jobStatus: string; followUp: FollowUpView }) {
    const { toast } = useToast()
    const [isPending, startTransition] = useTransition()
    const [dialog, setDialog] = useState<'reschedule' | 'retry' | 'cancel' | null>(null)
    // Times are computed when a dialog opens (an event handler), not during render.
    const [timing, setTiming] = useState({ initial: '', min: '' })

    const openTimed = (kind: 'reschedule' | 'retry') => {
        const now = Date.now()
        const initial = kind === 'reschedule' && followUp.dueAt
            ? followUp.dueAt
            : new Date(now + (kind === 'retry' ? 15 * 60_000 : 86_400_000)).toISOString()
        setTiming({ initial, min: new Date(now + 60_000).toISOString() })
        setDialog(kind)
    }

    const badge = STATUS_BADGE[followUp.status] ?? { label: followUp.status, variant: 'outline' as const }
    const canChange = followUp.status === 'scheduled' && awaitingReply(jobStatus, followUp.number)
    const canRetry = followUp.status === 'failed'
        && isSafeToRetry(followUp.errorCode)
        && awaitingReply(jobStatus, followUp.number)

    const run = (action: () => Promise<{ success: boolean; message?: string }>, success: string) => {
        startTransition(async () => {
            const result = await action()
            if (result.success) {
                setDialog(null)
                toast({ title: success })
            } else {
                toast({ title: 'Could not change the follow-up', description: result.message, variant: 'destructive' })
            }
        })
    }

    return (
        <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">Follow-up {followUp.number}</p>
                <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
                {followUp.status === 'scheduled' && followUp.dueAt && (
                    <p className="flex items-center gap-2 text-foreground">
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        Scheduled for {format(new Date(followUp.dueAt), 'PPP p')}
                    </p>
                )}
                {followUp.status === 'processing' && (
                    <p className="flex items-center gap-2 text-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Being sent now. It cannot be changed until this finishes.
                    </p>
                )}
                {followUp.status === 'sent' && followUp.sentAt && (
                    <p className="text-foreground">Sent {format(new Date(followUp.sentAt), 'PPP p')}</p>
                )}
                {followUp.status === 'cancelled' && (
                    <p>{cancellationReason(followUp.errorCode) ?? 'Cancelled. It will not be sent.'}</p>
                )}
                {followUp.status === 'failed' && (
                    <p className="text-destructive">{failureReason(followUp.errorCode)}</p>
                )}
                {followUp.attempts > 0 && <p>Attempts so far: {followUp.attempts}</p>}
            </div>

            {(canChange || canRetry) && (
                <div className="flex flex-wrap gap-2 pt-1">
                    {canChange && (
                        <>
                            <Button variant="outline" size="sm" disabled={isPending} onClick={() => openTimed('reschedule')}>
                                Change date
                            </Button>
                            <Button variant="outline" size="sm" disabled={isPending} onClick={() => setDialog('cancel')}>
                                Cancel follow-up
                            </Button>
                        </>
                    )}
                    {canRetry && (
                        <Button size="sm" disabled={isPending} onClick={() => openTimed('retry')}>
                            Retry
                        </Button>
                    )}
                </div>
            )}

            {dialog === 'reschedule' && (
                <TimeDialog
                    title={`Change the date of follow-up ${followUp.number}`}
                    description={`The follow-up is sent automatically at this time. Follow-ups go out ${sendWindowLabel(followUpTimeZone())}.`}
                    confirmLabel="Save date"
                    initial={timing.initial}
                    min={timing.min}
                    pending={isPending}
                    onClose={() => setDialog(null)}
                    onConfirm={(iso) => run(() => rescheduleFollowUp(jobId, followUp.id, iso), 'Follow-up rescheduled')}
                />
            )}

            {dialog === 'retry' && (
                <TimeDialog
                    title={`Retry follow-up ${followUp.number}`}
                    description={`The retry is sent automatically at this time. Follow-ups go out ${sendWindowLabel(followUpTimeZone())}.`}
                    confirmLabel="Schedule retry"
                    initial={timing.initial}
                    min={timing.min}
                    pending={isPending}
                    onClose={() => setDialog(null)}
                    onConfirm={(iso) => run(() => retryFollowUp(jobId, followUp.id, iso), 'Retry scheduled')}
                />
            )}

            <ConfirmDialog
                open={dialog === 'cancel'}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Cancel follow-up ${followUp.number}?`}
                description="It will not be sent. The application itself stays as sent."
                confirmLabel="Cancel follow-up"
                destructive
                onConfirm={() => {
                    // Closed at once so a second click cannot send a second request. Failures still show as a toast.
                    setDialog(null)
                    run(() => cancelFollowUp(jobId, followUp.id), 'Follow-up cancelled')
                }}
            />
        </div>
    )
}

// datetime-local works in the user's time zone. The value is converted to an ISO time before it is sent,
// and the server validates it again.
function TimeDialog({
    title,
    description,
    confirmLabel,
    initial,
    min,
    pending,
    onClose,
    onConfirm,
}: {
    title: string
    description: string
    confirmLabel: string
    initial: string
    min: string
    pending: boolean
    onClose: () => void
    onConfirm: (iso: string) => void
}) {
    const { toast } = useToast()
    const [value, setValue] = useState(toLocalInput(new Date(initial)))
    const minValue = toLocalInput(new Date(min))

    const submit = (event: FormEvent) => {
        event.preventDefault()
        const time = new Date(value)
        if (Number.isNaN(time.getTime())) {
            toast({ title: 'Choose a valid date and time', variant: 'destructive' })
            return
        }
        onConfirm(time.toISOString())
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-2">
                    <Label htmlFor="follow-up-time">Date and time</Label>
                    <Input
                        id="follow-up-time"
                        type="datetime-local"
                        min={minValue}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        required
                    />
                    <DialogFooter className="gap-2 pt-4">
                        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                            Back
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending && <Loader2 className="animate-spin" />}
                            {confirmLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function toLocalInput(date: Date): string {
    return format(date, "yyyy-MM-dd'T'HH:mm")
}
