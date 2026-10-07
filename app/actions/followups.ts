'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { applyFollowUpAction, createSupabaseManageStore, type FollowUpAction } from '@/lib/followups/manage';
import { logger, errorFields } from '@/lib/log/logger';
import { requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/types/actions';

const idsSchema = z.object({
    jobId: z.string().uuid(),
    followUpId: z.string().uuid(),
});

export interface FollowUpChange {
    status: string;
    dueAt: string | null;
}

export async function cancelFollowUp(jobId: string, followUpId: string): Promise<ActionResult<FollowUpChange>> {
    return runAction(jobId, followUpId, { kind: 'cancel' });
}

export async function rescheduleFollowUp(jobId: string, followUpId: string, dueAt: string): Promise<ActionResult<FollowUpChange>> {
    return runAction(jobId, followUpId, { kind: 'reschedule', dueAt });
}

// Retry is offered only for failures where nothing reached the recipient. The check is in lib/followups/manage.ts.
export async function retryFollowUp(jobId: string, followUpId: string, dueAt: string): Promise<ActionResult<FollowUpChange>> {
    return runAction(jobId, followUpId, { kind: 'retry', dueAt });
}

async function runAction(jobId: string, followUpId: string, action: FollowUpAction): Promise<ActionResult<FollowUpChange>> {
    const ids = idsSchema.safeParse({ jobId, followUpId });
    if (!ids.success) {
        return { success: false, message: 'This follow-up could not be found.' };
    }

    try {
        const { supabase, user } = await requireUser();
        const result = await applyFollowUpAction(createSupabaseManageStore(supabase), {
            userId: user.id,
            jobId: ids.data.jobId,
            followUpId: ids.data.followUpId,
            action,
            now: new Date(),
        });

        logger.info('followup.user_action', {
            action: action.kind,
            follow_up_id: followUpId,
            job_id: jobId,
            outcome: result.ok ? 'applied' : result.code,
        });

        if (!result.ok) {
            return { success: false, message: result.message };
        }

        revalidatePath(`/dashboard/job-posts/${jobId}`);
        return { success: true, data: { status: result.status, dueAt: result.dueAt } };
    } catch (error) {
        logger.error('followup.user_action_failed', { action: action.kind, follow_up_id: followUpId, job_id: jobId, ...errorFields(error) });
        return { success: false, message: 'The follow-up could not be changed. Try again.' };
    }
}
