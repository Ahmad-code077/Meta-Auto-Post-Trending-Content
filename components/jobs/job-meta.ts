import type { JobStatus } from '@/lib/types/jobs'
import { AWAITING_REPLY_STATUSES } from '@/lib/inbox/match'

export const STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    new: { label: 'New', variant: 'outline' },
    draft_created: { label: 'Draft created', variant: 'secondary' },
    sent: { label: 'Sent', variant: 'default' },
    follow_up_1: { label: 'Follow-up 1', variant: 'outline' },
    follow_up_2: { label: 'Follow-up 2', variant: 'outline' },
    replied: { label: 'Replied', variant: 'default' },
    closed_no_response: { label: 'Closed, no response', variant: 'destructive' },
}

// Follow-up status badges. Shared by the panel and the overview. Kept out of client modules so server components can import it.
export const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    scheduled: { label: 'Scheduled', variant: 'outline' },
    processing: { label: 'Sending now', variant: 'secondary' },
    sent: { label: 'Sent', variant: 'default' },
    failed: { label: 'Failed', variant: 'destructive' },
    cancelled: { label: 'Cancelled', variant: 'outline' },
}

// Sent and not replied to yet. The same statuses the scheduler and the inbox sync treat as awaiting a reply.
export function isAwaitingReply(status: string): boolean {
    return (AWAITING_REPLY_STATUSES as readonly string[]).includes(status)
}
