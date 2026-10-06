import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { DraftReview, type DraftView, type SentView } from '@/components/jobs/draft-review'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/supabase/server'
import type { GenerationRecord } from '@/lib/types/applications'

export default async function JobReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const { supabase, user } = await requireUser()

    const { data: job } = await supabase
        .from('jobs')
        .select('id, title, company, recruiter_name, recruiter_email, status, raw_post')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle()

    if (!job) notFound()

    const { data: emails, error } = await supabase
        .from('application_emails')
        .select('id, kind, follow_up_number, status, subject, body, to_email, sent_at, error, generation, updated_at')
        .eq('job_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    if (error) throw new Error('Could not load this application')

    const rows = emails ?? []
    // Only written, unsent mail is reviewed here. Scheduled follow-ups have no text until they are processed.
    const pending = rows.find((e) => ['draft', 'failed', 'sending'].includes(e.status)) ?? null
    const sent = rows.find((e) => e.status === 'sent' && e.kind === 'application') ?? null

    const { data: resume } = await supabase
        .from('resumes')
        .select('file_name')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .maybeSingle()

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
        </div>
    )
}
