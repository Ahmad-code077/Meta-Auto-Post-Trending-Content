'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { createApplicationDraft, createFollowUpDraft, ensureJobAnalysis, getOwnedJob, HarnessError } from '@/lib/harness/application';
import { sendApplicationEmail } from '@/lib/mail/send';
import type { ActionResult } from '@/lib/types/actions';
import type { ApplicationEmail } from '@/lib/types/applications';
import type { Job } from '@/lib/types/jobs';

const JOB_DESCRIPTION_MIN = 50;
const JOB_DESCRIPTION_MAX = 5000;
const DRAFT_BODY_MAX = 8000;

const draftEditSchema = z.object({
    subject: z
        .string()
        .trim()
        .min(1, 'Subject is required')
        .max(120, 'Subject must be 120 characters or fewer')
        .refine((v) => !/[\r\n]/.test(v), 'Subject must be one line'),
    body: z
        .string()
        .trim()
        .min(1, 'The email body is empty')
        .max(DRAFT_BODY_MAX, `The email must be ${DRAFT_BODY_MAX} characters or fewer`),
});

function failure(error: unknown, fallback: string): { success: false; message: string } {
    if (error instanceof HarnessError) return { success: false, message: error.message };
    console.error(fallback, error);
    return { success: false, message: fallback };
}

// Stores a pasted posting, analyzes it, and prepares a draft. Nothing is sent.
export async function createApplicationFromJobDescription(
    rawPost: string
): Promise<ActionResult<{ jobId: string; draftCreated: boolean; message: string }>> {
    try {
        const text = rawPost.trim();
        if (text.length < JOB_DESCRIPTION_MIN || text.length > JOB_DESCRIPTION_MAX) {
            return { success: false, message: `Job description must be between ${JOB_DESCRIPTION_MIN} and ${JOB_DESCRIPTION_MAX} characters` };
        }

        const { supabase, user } = await requireUser();

        const { data: job, error } = await supabase
            .from('jobs')
            .insert({ user_id: user.id, raw_post: text, status: 'new' })
            .select('*')
            .single();

        if (error || !job) throw new Error(error?.message ?? 'Insert failed');

        revalidatePath('/dashboard/job-posts');

        try {
            await createApplicationDraft(supabase, user.id, job.id);
            revalidatePath('/dashboard/job-posts');
            return {
                success: true,
                data: { jobId: job.id, draftCreated: true, message: 'Draft created. Review it, then send.' },
            };
        } catch (draftError) {
            // The job is saved even when drafting fails, so the user can fix the profile and retry.
            const message = draftError instanceof HarnessError ? draftError.message : 'Draft could not be created';
            if (!(draftError instanceof HarnessError)) console.error('Draft creation failed:', draftError);
            return {
                success: true,
                data: { jobId: job.id, draftCreated: false, message: `Saved. ${message}` },
            };
        }
    } catch (error) {
        return failure(error, 'The job description could not be saved');
    }
}

export async function generateApplicationDraft(jobId: string): Promise<ActionResult<ApplicationEmail>> {
    try {
        const { supabase, user } = await requireUser();
        const draft = await createApplicationDraft(supabase, user.id, jobId);
        revalidatePath('/dashboard/job-posts');
        return { success: true, data: draft };
    } catch (error) {
        return failure(error, 'The draft could not be created');
    }
}

export async function generateFollowUpDraft(jobId: string): Promise<ActionResult<ApplicationEmail>> {
    try {
        const { supabase, user } = await requireUser();
        const draft = await createFollowUpDraft(supabase, user.id, jobId);
        revalidatePath('/dashboard/job-posts');
        return { success: true, data: draft };
    } catch (error) {
        return failure(error, 'The follow-up could not be created');
    }
}

// Sends the newest unsent draft for a job: the application, or a follow-up if one is waiting.
export async function sendJobEmail(jobId: string): Promise<ActionResult<{ emailId: string }>> {
    try {
        const { supabase, user } = await requireUser();

        const { data: draft, error } = await supabase
            .from('application_emails')
            .select('id')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .in('status', ['draft', 'failed'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!draft) return { success: false, message: 'There is no draft to send for this job' };

        const sent = await sendApplicationEmail(supabase, user.id, draft.id);
        revalidatePath('/dashboard/job-posts');
        return { success: true, data: { emailId: sent.id } };
    } catch (error) {
        return failure(error, 'The email could not be sent');
    }
}

// Re-runs analysis for a job, for example after editing its description.
export async function reanalyzeJob(jobId: string): Promise<ActionResult<Job>> {
    try {
        const { supabase, user } = await requireUser();
        const job = await getOwnedJob(supabase, user.id, jobId);
        await ensureJobAnalysis(supabase, { ...job, analysis_hash: null });
        revalidatePath('/dashboard/job-posts');
        return { success: true, data: await getOwnedJob(supabase, user.id, jobId) };
    } catch (error) {
        return failure(error, 'The job could not be analyzed');
    }
}

// Saves the user's edits to an unsent draft. Only drafts that are not being sent can change.
// The generation record is kept, and gets an edited_at marker so the audit trail shows the text was changed by hand.
export async function updateApplicationDraft(
    emailId: string,
    input: { subject: string; body: string }
): Promise<ActionResult<ApplicationEmail>> {
    const parsed = draftEditSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, message: parsed.error.issues[0]?.message ?? 'Check the draft' };
    }

    try {
        const { supabase, user } = await requireUser();

        const { data: current, error } = await supabase
            .from('application_emails')
            .select('id, job_id, generation')
            .eq('id', emailId)
            .eq('user_id', user.id)
            .in('status', ['draft', 'failed'])
            .maybeSingle();

        if (error) throw error;
        if (!current) return { success: false, message: 'This draft can no longer be edited' };

        const generation = current.generation ? { ...current.generation, edited_at: new Date().toISOString() } : null;

        const { data, error: updateError } = await supabase
            .from('application_emails')
            .update({
                subject: parsed.data.subject,
                body: parsed.data.body,
                generation,
                updated_at: new Date().toISOString(),
            })
            .eq('id', emailId)
            .eq('user_id', user.id)
            .select('*')
            .single();

        if (updateError || !data) throw updateError ?? new Error('Update failed');

        revalidatePath('/dashboard/job-posts');
        return { success: true, data: data as ApplicationEmail };
    } catch (error) {
        return failure(error, 'The draft could not be saved');
    }
}
