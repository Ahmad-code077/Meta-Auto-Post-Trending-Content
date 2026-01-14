'use server';

import { createClient } from '@/lib/supabase/server';
import type { SendEmailResponse } from '@/lib/types/jobs';
import { revalidatePath } from 'next/cache';

export async function sendJobEmail(jobId: string): Promise<SendEmailResponse> {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return {
                success: false,
                message: 'User not authenticated',
                error: 'UNAUTHORIZED',
            };
        }

        // Fetch the job to ensure it exists and belongs to the user
        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !job) {
            return {
                success: false,
                message: 'Job not found or unauthorized',
                error: 'NOT_FOUND',
            };
        }

        // Validate that job has required email data
        if (!job.gmail_message_id) {
            return {
                success: false,
                message: 'No email draft link available for this job',
                error: 'MISSING_EMAIL_DRAFT',
            };
        }

        if (!job.recruiter_email) {
            return {
                success: false,
                message: 'No recruiter email available for this job',
                error: 'MISSING_RECRUITER_EMAIL',
            };
        }

        // Check if job is in the correct status
        if (job.status !== 'draft_created') {
            return {
                success: false,
                message: `Cannot send email. Job status is "${job.status}"`,
                error: 'INVALID_STATUS',
            };
        }

        // TODO: Replace this URL with your actual webhook endpoint
        const webhookUrl = process.env.NEXT_PUBLIC_SEND_EMAIL_WEBHOOK_URL || 'https://my-automation-4j0i.onrender.com/webhook/send-job-post-email';

        // Call the webhook to send the email
        const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jobId: job.id,
                recruiterEmail: job.recruiter_email,
                recruiterName: job.recruiter_name,
                company: job.company,
                jobTitle: job.title,
                emailDraftLink: job.email_draft_link,
                userId: user.id,
            }),
        });

        if (!webhookResponse.ok) {
            const errorText = await webhookResponse.text();
            console.error('Webhook error:', errorText);

            return {
                success: false,
                message: 'Failed to send email via webhook',
                error: 'WEBHOOK_ERROR',
            };
        }

        revalidatePath('/dashboard/job-posts');

        return {
            success: true,
            message: 'Email sent successfully',
        };
    } catch (error) {
        console.error('Error in sendJobEmail:', error);
        return {
            success: false,
            message: 'An unexpected error occurred',
            error: 'UNKNOWN_ERROR',
        };
    }
}

export async function scheduleFollowUp(
    jobId: string,
    followUpNumber: 1 | 2
): Promise<SendEmailResponse> {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return {
                success: false,
                message: 'User not authenticated',
                error: 'UNAUTHORIZED',
            };
        }

        const { data: job, error: fetchError } = await supabase
            .from('jobs')
            .select('*')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !job) {
            return {
                success: false,
                message: 'Job not found or unauthorized',
                error: 'NOT_FOUND',
            };
        }

        // Update job with follow-up status
        const newStatus = followUpNumber === 1 ? 'follow_up_1' : 'follow_up_2';
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 7); // Schedule 7 days later

        const { error: updateError } = await supabase
            .from('jobs')
            .update({
                status: newStatus,
                follow_up_count: followUpNumber,
                follow_up_date: followUpDate.toISOString(),
            })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (updateError) {
            return {
                success: false,
                message: 'Failed to schedule follow-up',
                error: 'UPDATE_ERROR',
            };
        }

        revalidatePath('/dashboard/job-posts');

        return {
            success: true,
            message: `Follow-up ${followUpNumber} scheduled successfully`,
        };
    } catch (error) {
        console.error('Error in scheduleFollowUp:', error);
        return {
            success: false,
            message: 'An unexpected error occurred',
            error: 'UNKNOWN_ERROR',
        };
    }
}
