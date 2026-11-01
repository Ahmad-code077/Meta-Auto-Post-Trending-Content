// Pure rule for "Keep following up": which pre-reply status a job returns to, based on how many
// follow-ups it has already sent. follow_up_count already exists and is already maintained by
// advanceJobAfterSend (lib/mail/send.ts), so no new column is needed to remember this.

import type { JobStatus } from '@/lib/types/jobs';

export function revertStatusAfterKeepFollowingUp(followUpCount: number): JobStatus {
    if (followUpCount <= 0) return 'sent';
    if (followUpCount === 1) return 'follow_up_1';
    return 'follow_up_2';
}
