import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { JobStatus } from '@/lib/types/jobs'
import { STATUS_BADGE, STATUS_CONFIG } from './job-meta'

export interface ApplicationOverviewProps {
    title: string | null
    company: string | null
    status: JobStatus
    recruiterName: string | null
    recruiterEmail: string | null
    sentAt: string | null
    nextFollowUp: { number: number; dueAt: string } | null
    latestFollowUp: { number: number; status: string } | null
    resumeName: string | null
    repliedAt: string | null
}

// Summary of the application. Every value comes from the job row, its emails, or the resume it used.
export function ApplicationOverview(props: ApplicationOverviewProps) {
    const latest = props.latestFollowUp ? STATUS_BADGE[props.latestFollowUp.status] : null

    return (
        <Card>
            <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>The key facts about this application.</CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Role">{props.title || 'Untitled role'}</Field>
                    <Field label="Company">{props.company || 'Not set'}</Field>
                    <Field label="Application status">
                        <Badge variant={STATUS_CONFIG[props.status].variant}>{STATUS_CONFIG[props.status].label}</Badge>
                    </Field>
                    <Field label="Recruiter">
                        {props.recruiterName || props.recruiterEmail ? (
                            <>
                                {props.recruiterName && <div>{props.recruiterName}</div>}
                                {props.recruiterEmail && <div className="break-all text-muted-foreground">{props.recruiterEmail}</div>}
                            </>
                        ) : (
                            'Not set'
                        )}
                    </Field>
                    {props.repliedAt && (
                        <Field label="Replied">{format(new Date(props.repliedAt), 'PPP p')}</Field>
                    )}
                    <Field label="Sent">
                        {props.sentAt ? format(new Date(props.sentAt), 'PPP p') : 'Not sent yet'}
                    </Field>
                    <Field label="Resume used">{props.resumeName || 'None attached yet'}</Field>
                    <Field label="Next follow-up">
                        {props.nextFollowUp
                            ? `Follow-up #${props.nextFollowUp.number}, ${format(new Date(props.nextFollowUp.dueAt), 'PPP p')}`
                            : 'None scheduled'}
                    </Field>
                    <Field label="Follow-up status">
                        {latest && props.latestFollowUp ? (
                            <Badge variant={latest.variant}>{`#${props.latestFollowUp.number} ${latest.label}`}</Badge>
                        ) : (
                            'No follow-up yet'
                        )}
                    </Field>
                </dl>
            </CardContent>
        </Card>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-foreground">{children}</dd>
        </div>
    )
}
