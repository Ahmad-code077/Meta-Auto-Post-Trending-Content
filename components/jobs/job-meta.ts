import type { Job, JobStatus } from '@/lib/types/jobs'

export const STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    new: { label: 'New', variant: 'outline' },
    draft_created: { label: 'Draft created', variant: 'secondary' },
    sent: { label: 'Sent', variant: 'default' },
    follow_up_1: { label: 'Follow-up 1', variant: 'outline' },
    follow_up_2: { label: 'Follow-up 2', variant: 'outline' },
    replied: { label: 'Replied', variant: 'default' },
    closed_no_response: { label: 'Closed, no response', variant: 'destructive' },
}

// Drafts open in the drafts folder. Sent or replied threads open in the inbox.
export function gmailUrl(job: Job): string | null {
    if (!job.gmail_message_id) return null
    return job.status === 'draft_created'
        ? `https://mail.google.com/mail/#drafts?compose=${job.gmail_message_id}`
        : `https://mail.google.com/mail/u/0/#inbox/${job.gmail_message_id}`
}

// A draft can be sent only when Gmail has one and the job is still in draft.
export function canSendEmail(job: Job): boolean {
    return job.status === 'draft_created' && Boolean(job.gmail_draft_id)
}
