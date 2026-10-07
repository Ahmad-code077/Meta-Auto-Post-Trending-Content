import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { DraftReview, type DraftView, type SentView } from '@/components/jobs/draft-review'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/supabase/server'
import type { GenerationRecord } from '@/lib/types/applications'
import { FollowUpPanel, type FollowUpView } from '@/components/jobs/follow-up-panel'
import { ApplicationOverview } from '@/components/jobs/application-overview'
import { ApplicationTimeline } from '@/components/jobs/application-timeline'
import { buildApplicationTimeline, followUpSummary, type TimelineEmail } from '@/lib/timeline/build'

export default async function JobReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { supabase, user } = await requireUser()

    const { data: job } = await supabase
        .from('jobs')
        .select('id, user_id, title, company, recruiter_name, recruiter_email, status, raw_post, created_at, analyzed_at, sent_at, replied_at')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (!job) notFound()

    const { data: emails, error } = await supabase
        .from('application_emails')
        .select('id, job_id, user_id, kind, follow_up_number, status, subject, body, to_email, sent_at, error, error_code, due_at, attempts, claimed_at, last_attempt_at, resume_id, generation, updated_at, created_at')
        .eq('job_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) throw new Error('Could not load this application')

    const rows = emails ?? []
    // The draft panel shows written mail only. Failed or scheduled follow-ups are handled by the follow-up panel.
    const pending = rows.find((e) =>
        e.status === 'draft' || e.status === 'sending' || (e.status === 'failed' && e.kind === 'application')
    ) ?? null
    const sent = rows.find((e) => e.status === 'sent' && e.kind === 'application') ?? null

    // One entry per follow-up number: the most recent row (rows are ordered newest first).
    const followUps: FollowUpView[] = []
    const seen = new Set<number>()
    for (const e of rows) {
        if (e.kind !== 'follow_up' || e.follow_up_number === null || seen.has(e.follow_up_number)) continue
        if (!['scheduled', 'processing', 'sent', 'failed', 'cancelled'].includes(e.status)) continue
        seen.add(e.follow_up_number)
        followUps.push({
            id: e.id,
            number: e.follow_up_number,
            status: e.status,
            dueAt: e.due_at,
            sentAt: e.sent_at,
            claimedAt: e.claimed_at,
            attempts: e.attempts ?? 0,
            errorCode: e.error_code,
        })
    }
    followUps.sort((a, b) => a.number - b.number)

    const { data: resume } = await supabase
        .from('resumes')
        .select('file_name')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .maybeSingle()

    // The resume the application was actually sent with. It may no longer be the current one.
    const usedResumeId = sent?.resume_id ?? null
    const { data: usedResume } = usedResumeId
        ? await supabase.from('resumes').select('file_name').eq('id', usedResumeId).eq('user_id', user.id).maybeSingle()
        : { data: null }

    const timelineEmails = rows as TimelineEmail[]
    const timeline = buildApplicationTimeline(
        { id: job.id, user_id: job.user_id, created_at: job.created_at, analyzed_at: job.analyzed_at, replied_at: job.replied_at },
        timelineEmails
    )
    const summary = followUpSummary({ id: job.id, user_id: job.user_id }, timelineEmails)

    const draft: DraftView | null = pending
        ? {
            id: pending.id,
            kind: pending.kind,
            status: pending.status as DraftView['status'],
            subject: pending.subject ?? '',
            body: pending.body ?? '',
            toEmail: pending.to_email,
            error: pending.error,
            edited: Boolean((pending.generation as GenerationRecord | null)?.edited_at),
            evidence: ((pending.generation as GenerationRecord | null)?.evidence ?? []).map((e) => ({
                id: e.id,
                sourceName: e.source_name,
                text: e.text,
            })),
        }
        : null

    const sentView: SentView | null = sent
        ? { subject: sent.subject, toEmail: sent.to_email, sentAt: sent.sent_at ?? sent.updated_at }
        : null

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <Button variant="ghost" size="sm" asChild className="-ml-3">
                <Link href="/dashboard/job-posts">
                    <ArrowLeft />
                    Applications
                </Link>
            </Button>

            <ApplicationOverview
                title={job.title}
                company={job.company}
                status={job.status}
                recruiterName={job.recruiter_name}
                recruiterEmail={job.recruiter_email}
                sentAt={sent?.sent_at ?? job.sent_at ?? null}
                nextFollowUp={summary.next ? { number: summary.next.number, dueAt: summary.next.dueAt } : null}
                latestFollowUp={summary.latest}
                resumeName={usedResume?.file_name ?? null}
                repliedAt={job.replied_at ?? null}
            />

            <DraftReview
                key={draft?.id ?? 'no-draft'}
                job={{
                    id: job.id,
                    title: job.title,
                    company: job.company,
                    recruiterName: job.recruiter_name,
                    recruiterEmail: job.recruiter_email,
                    status: job.status,
                    rawPost: job.raw_post,
                }}
                draft={draft}
                sent={sentView}
                resumeName={resume?.file_name ?? null}
            />

            <FollowUpPanel jobId={job.id} jobStatus={job.status} followUps={followUps} />

            <ApplicationTimeline events={timeline} />
        </div>
    )
}
