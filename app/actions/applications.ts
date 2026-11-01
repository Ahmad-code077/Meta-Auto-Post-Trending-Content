'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { revalidateApplicationPaths } from '@/lib/applications/revalidate';
import { draftGuard, parseGenerationInput } from '@/lib/generation/guard';
import { GenerationError } from '@/lib/harness/write';
import { createApplicationDraft, createFollowUpDraft, ensureJobAnalysis, getOwnedJob, HarnessError } from '@/lib/harness/application';
import { applyRecruiterEmailLock } from '@/lib/jobs/editable';
import { revertStatusAfterKeepFollowingUp } from '@/lib/jobs/reply-review';
import { sendApplicationEmail } from '@/lib/mail/send';
import type { ActionResult } from '@/lib/types/actions';
import type { ApplicationEmail } from '@/lib/types/applications';
import type { Job } from '@/lib/types/jobs';

const JOB_DESCRIPTION_MIN = 50;
const JOB_DESCRIPTION_MAX = 5000;
const DRAFT_BODY_MAX = 8000;

// Empty string clears a field to null; anything else is trimmed and length-capped.
const optionalText = (max: number) =>
    z.string().trim().max(max).transform((v) => (v === '' ? null : v)).optional();

const jobDetailsSchema = z.object({
    title: optionalText(200),
    company: optionalText(200),
    recruiter_name: optionalText(200),
    recruiter_email: z.string().trim().max(254)
        .refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email')
        .transform((v) => (v === '' ? null : v))
        .optional(),
    location: optionalText(200),
    work_type: optionalText(60),
    timings: optionalText(200),
});

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
    if (error instanceof GenerationError) return { success: false, message: error.message };
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

        revalidateApplicationPaths(job.id);

        try {
            // Same guard as the other generation actions. A refused slot leaves the saved job without a draft.
            const slot = draftGuard.acquire(user.id, job.id);
            if (!slot.ok) throw new HarnessError(slot.message);
            try {
                await createApplicationDraft(supabase, user.id, job.id);
            } finally {
                slot.release();
            }
            revalidateApplicationPaths(job.id);
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

// Each call is a new generation with its own two-call cap. Concurrent calls for the same application are refused.
export async function generateApplicationDraft(jobId: string, note?: string | null): Promise<ActionResult<ApplicationEmail>> {
    const input = parseGenerationInput({ jobId, note });
    if (!input.ok) return { success: false, message: input.message };

    try {
        const { supabase, user } = await requireUser();
        const slot = draftGuard.acquire(user.id, input.jobId);
        if (!slot.ok) return { success: false, message: slot.message };

        try {
            const draft = await createApplicationDraft(supabase, user.id, input.jobId, { note: input.note });
            revalidateApplicationPaths(input.jobId);
            return { success: true, data: draft };
        } finally {
            slot.release();
        }
    } catch (error) {
        return failure(error, 'The draft could not be created');
    }
}

export async function generateFollowUpDraft(jobId: string): Promise<ActionResult<ApplicationEmail>> {
    const input = parseGenerationInput({ jobId });
    if (!input.ok) return { success: false, message: input.message };

    try {
        const { supabase, user } = await requireUser();
        const slot = draftGuard.acquire(user.id, input.jobId);
        if (!slot.ok) return { success: false, message: slot.message };

        try {
            const draft = await createFollowUpDraft(supabase, user.id, input.jobId);
            revalidateApplicationPaths(input.jobId);
            return { success: true, data: draft };
        } finally {
            slot.release();
        }
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
        revalidateApplicationPaths(jobId);
        return { success: true, data: { emailId: sent.id } };
    } catch (error) {
        return failure(error, 'The email could not be sent');
    }
}

// Hides a job from the Command Center without touching its history. Idempotent: a second call
// matches no row (it is already dismissed) and reports that instead of doing nothing silently.
export async function dismissJob(jobId: string): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { data, error } = await supabase
            .from('jobs')
            .update({ dismissed_at: new Date().toISOString() })
            .eq('id', jobId)
            .eq('user_id', user.id)
            .is('dismissed_at', null)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return { success: false, message: 'This application was already dismissed.' };

        revalidateApplicationPaths(jobId);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'The application could not be dismissed');
    }
}

// Brings a dismissed job back to the Command Center. Idempotent, same as dismissJob.
export async function restoreJob(jobId: string): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { data, error } = await supabase
            .from('jobs')
            .update({ dismissed_at: null })
            .eq('id', jobId)
            .eq('user_id', user.id)
            .not('dismissed_at', 'is', null)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return { success: false, message: 'This application is not dismissed.' };

        revalidateApplicationPaths(jobId);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'The application could not be restored');
    }
}

// Confirms an engaged/rejected reply that is awaiting your review: status becomes 'replied', and the
// pending follow-up (never cancelled while awaiting review) is cancelled now. Conditional on the job
// still being awaiting_review, so a click that loses a race against the 2-day auto-confirm (see
// lib/followups/grace.ts) reports a conflict instead of double-processing.
export async function markJobReplied(jobId: string): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { data: job, error } = await supabase
            .from('jobs')
            .update({ status: 'replied', replied_at: new Date().toISOString() })
            .eq('id', jobId)
            .eq('user_id', user.id)
            .eq('status', 'awaiting_review')
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!job) return { success: false, message: 'This application is not awaiting review.' };

        const { error: cancelError } = await supabase
            .from('application_emails')
            .update({
                status: 'cancelled',
                due_at: null,
                claim_token: null,
                error: 'Marked as replied by you.',
                error_code: 'MANUAL_MARKED_REPLIED',
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('job_id', jobId)
            .eq('kind', 'follow_up')
            .eq('status', 'scheduled');

        if (cancelError) throw cancelError;

        revalidateApplicationPaths(jobId);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'This application could not be marked as replied');
    }
}

// Dismisses the classification: the reply is not treated as a real answer, and the job returns to
// awaiting a reply at whichever stage it was at (lib/jobs/reply-review.ts). The pending follow-up was
// never touched while awaiting_review, so it is simply eligible to send again.
export async function keepFollowingUp(jobId: string): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { data: job, error: loadError } = await supabase
            .from('jobs')
            .select('id, follow_up_count')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .eq('status', 'awaiting_review')
            .maybeSingle();

        if (loadError) throw loadError;
        if (!job) return { success: false, message: 'This application is not awaiting review.' };

        const { data, error } = await supabase
            .from('jobs')
            .update({
                status: revertStatusAfterKeepFollowingUp(job.follow_up_count ?? 0),
                reply_classification: null,
                reply_message_id: null,
                reply_match: null,
            })
            .eq('id', jobId)
            .eq('user_id', user.id)
            .eq('status', 'awaiting_review')
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return { success: false, message: 'This application is not awaiting review.' };

        revalidateApplicationPaths(jobId);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'This application could not be updated');
    }
}

// Re-runs analysis for a job, for example after editing its description.
export async function reanalyzeJob(jobId: string): Promise<ActionResult<Job>> {
    try {
        const { supabase, user } = await requireUser();
        const job = await getOwnedJob(supabase, user.id, jobId);
        await ensureJobAnalysis(supabase, { ...job, analysis_hash: null });
        revalidateApplicationPaths(jobId);
        return { success: true, data: await getOwnedJob(supabase, user.id, jobId) };
    } catch (error) {
        return failure(error, 'The job could not be analyzed');
    }
}

// Saves manual corrections to the job's own facts -- the backstop for whatever analysis misses or
// gets wrong. recruiter_email is dropped from the update once the job has been sent: the address
// used at send time is the historical record (kept on the sent application_emails row, not here),
// so this field becomes read-only rather than silently diverging from what was actually used.
export async function updateJobDetails(
    jobId: string,
    input: Record<string, unknown>
): Promise<ActionResult<Job>> {
    const parsed = jobDetailsSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, message: parsed.error.issues[0]?.message ?? 'Check the details' };
    }

    try {
        const { supabase, user } = await requireUser();
        const job = await getOwnedJob(supabase, user.id, jobId);
        const patch = applyRecruiterEmailLock(job.status, parsed.data);

        if (Object.keys(patch).length === 0) {
            return { success: true, data: job };
        }

        const { data, error } = await supabase
            .from('jobs')
            .update(patch)
            .eq('id', jobId)
            .eq('user_id', user.id)
            .select('*')
            .single();

        if (error || !data) throw new Error(error?.message ?? 'Update failed');

        revalidateApplicationPaths(jobId);
        return { success: true, data: data as Job };
    } catch (error) {
        return failure(error, 'The job details could not be saved');
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

        revalidateApplicationPaths(current.job_id);
        return { success: true, data: data as ApplicationEmail };
    } catch (error) {
        return failure(error, 'The draft could not be saved');
    }
}
