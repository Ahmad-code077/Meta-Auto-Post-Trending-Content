'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { AlertCircle, Loader2, Mail, RotateCcw, Send } from 'lucide-react'
import { generateApplicationDraft, sendJobEmail, updateApplicationDraft } from '@/app/actions/applications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@/lib/types/jobs'
import { STATUS_CONFIG } from './job-meta'

export interface DraftView {
    id: string
    kind: 'application' | 'follow_up'
    status: 'draft' | 'sending' | 'failed'
    subject: string
    body: string
    toEmail: string
    error: string | null
    edited: boolean
    evidence: { id: string; sourceName: string; text: string }[]
}

export interface SentView {
    subject: string
    toEmail: string
    sentAt: string
}

interface DraftReviewProps {
    job: {
        id: string
        title: string | null
        company: string | null
        recruiterName: string | null
        recruiterEmail: string | null
        status: JobStatus
        rawPost: string
    }
    draft: DraftView | null
    sent: SentView | null
    resumeName: string | null
}

// Review step for an application. The draft is editable until it is sent.
// Sending is never optimistic: the UI waits for SMTP to accept the message.
export function DraftReview({ job, draft, sent, resumeName }: DraftReviewProps) {
    const router = useRouter()
    const { toast } = useToast()

    const [subject, setSubject] = useState(draft?.subject ?? '')
    const [body, setBody] = useState(draft?.body ?? '')
    const [saved, setSaved] = useState({ subject: draft?.subject ?? '', body: draft?.body ?? '' })
    const [error, setError] = useState<string | null>(null)
    const [confirmSend, setConfirmSend] = useState(false)
    const [confirmRegenerate, setConfirmRegenerate] = useState(false)
    const [isSaving, startSaving] = useTransition()
    const [isSending, startSending] = useTransition()
    const [isGenerating, startGenerating] = useTransition()

    const dirty = subject !== saved.subject || body !== saved.body
    const recipient = draft?.toEmail ?? job.recruiterEmail ?? null
    const canSend = Boolean(draft) && !dirty && Boolean(resumeName) && Boolean(recipient) && draft?.status !== 'sending'

    const save = () => {
        if (!draft) return
        startSaving(async () => {
            const result = await updateApplicationDraft(draft.id, { subject, body })
            if (result.success) {
                setSaved({ subject, body })
                setError(null)
                toast({ title: 'Draft saved' })
                router.refresh()
            } else {
                setError(result.message)
            }
        })
    }

    const revert = () => {
        setSubject(saved.subject)
        setBody(saved.body)
    }

    const send = () => {
        setConfirmSend(false)
        startSending(async () => {
            const result = await sendJobEmail(job.id)
            if (result.success) {
                toast({ title: 'Email sent', description: `Delivered to ${recipient}.` })
                router.refresh()
            } else {
                setError(result.message)
                toast({ title: 'Email not sent', description: result.message, variant: 'destructive' })
                router.refresh()
            }
        })
    }

    const generate = () => {
        setConfirmRegenerate(false)
        setError(null)
        startGenerating(async () => {
            const result = await generateApplicationDraft(job.id)
            if (result.success) {
                toast({ title: 'Draft generated', description: 'Review it before sending.' })
                router.refresh()
            } else {
                setError(result.message)
            }
        })
    }

    const sendBlocker = !draft
        ? 'Generate a draft first.'
        : dirty
            ? 'Save your changes before sending.'
            : !resumeName
                ? 'Upload a resume in your profile. Applications always attach it.'
                : !recipient
                    ? 'This job has no recruiter email.'
                    : null

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="truncate text-2xl font-semibold tracking-tight text-foreground">{job.title || 'Untitled role'}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {job.company || 'Company not set'}
                        {job.recruiterName ? ` · ${job.recruiterName}` : ''}
                        {job.recruiterEmail ? ` · ${job.recruiterEmail}` : ''}
                    </p>
                </div>
                <Badge variant={STATUS_CONFIG[job.status].variant} className="shrink-0 self-start">
                    {STATUS_CONFIG[job.status].label}
                </Badge>
            </header>

            {sent && (
                <Card>
                    <CardContent className="flex items-start gap-3 pt-6">
                        <Mail className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Application sent to {sent.toEmail}</p>
                            <p className="text-sm text-muted-foreground">
                                {format(new Date(sent.sentAt), 'PPP p')} · “{sent.subject}”
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!draft ? (
                <Card>
                    <CardHeader>
                        <CardTitle>No draft yet</CardTitle>
                        <CardDescription>
                            The draft is written from your profile: the skills this job asks for and the experience and projects that show them.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && <ErrorNote message={error} />}
                        {!sent && (
                            <Button onClick={generate} disabled={isGenerating}>
                                {isGenerating && <Loader2 className="animate-spin" />}
                                {isGenerating ? 'Writing draft' : 'Generate draft'}
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <CardTitle>{draft.kind === 'follow_up' ? 'Follow-up' : 'Application email'}</CardTitle>
                                    <CardDescription>
                                        {draft.edited ? 'Edited by you since it was generated.' : 'Generated from your profile. Edit anything before sending.'}
                                    </CardDescription>
                                </div>
                                {dirty && <Badge variant="outline">Unsaved</Badge>}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {draft.status === 'failed' && draft.error && <ErrorNote message={`Last send failed: ${draft.error}`} />}
                            {error && <ErrorNote message={error} />}

                            <div className="space-y-2">
                                <Label htmlFor="draft-subject">Subject</Label>
                                <Input
                                    id="draft-subject"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    maxLength={120}
                                    disabled={draft.status === 'sending' || isSaving}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="draft-body">Body</Label>
                                <Textarea
                                    id="draft-body"
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    rows={16}
                                    maxLength={8000}
                                    className="leading-relaxed"
                                    disabled={draft.status === 'sending' || isSaving}
                                />
                                <p className="text-xs text-muted-foreground">{body.trim().split(/\s+/).filter(Boolean).length} words</p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={revert} disabled={!dirty || isSaving}>
                                        <RotateCcw />
                                        Revert
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setConfirmRegenerate(true)} disabled={isGenerating || draft.status === 'sending'}>
                                        {isGenerating && <Loader2 className="animate-spin" />}
                                        Regenerate
                                    </Button>
                                </div>
                                <Button size="sm" onClick={save} disabled={!dirty || isSaving}>
                                    {isSaving && <Loader2 className="animate-spin" />}
                                    Save changes
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Send</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <dl className="space-y-3 text-sm">
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">To</dt>
                                        <dd className="mt-0.5 break-all">{recipient ?? 'No recruiter email'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Resume</dt>
                                        <dd className="mt-0.5">
                                            {resumeName ? (
                                                <span className="break-all">{resumeName}</span>
                                            ) : (
                                                <Link href="/dashboard/profile" className="text-primary underline-offset-4 hover:underline">
                                                    Upload one in your profile
                                                </Link>
                                            )}
                                        </dd>
                                    </div>
                                </dl>

                                {sendBlocker && <p className="text-xs text-muted-foreground">{sendBlocker}</p>}

                                <Button className="w-full" onClick={() => setConfirmSend(true)} disabled={!canSend || isSending}>
                                    {isSending ? <Loader2 className="animate-spin" /> : <Send />}
                                    {isSending ? 'Sending' : 'Send application'}
                                </Button>
                            </CardContent>
                        </Card>

                        {draft.evidence.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Based on</CardTitle>
                                    <CardDescription>The profile entries this draft draws on.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-3 text-sm">
                                        {draft.evidence.map((item) => (
                                            <li key={item.id} className="space-y-0.5">
                                                <p className="text-xs font-medium text-muted-foreground">{item.sourceName}</p>
                                                <p className="text-foreground">{item.text}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        <details className="rounded-md border p-4 text-sm">
                            <summary className="cursor-pointer font-medium">Job posting</summary>
                            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{job.rawPost}</pre>
                        </details>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={confirmSend}
                onOpenChange={setConfirmSend}
                title="Send this application?"
                description={`It will be sent to ${recipient} with ${resumeName}. Once SMTP accepts it, it cannot be recalled from here.`}
                confirmLabel="Send"
                onConfirm={send}
            />

            <ConfirmDialog
                open={confirmRegenerate}
                onOpenChange={setConfirmRegenerate}
                title="Write a new draft?"
                description="The current draft is replaced, and your edits to it are lost. Sent emails are not affected."
                confirmLabel="Write new draft"
                destructive
                onConfirm={generate}
            />
        </div>
    )
}

function ErrorNote({ message }: { message: string }) {
    return (
        <div role="alert" className={cn('flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive')}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
        </div>
    )
}
