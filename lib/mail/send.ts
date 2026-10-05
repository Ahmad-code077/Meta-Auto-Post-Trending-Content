// Sends a reviewed draft over SMTP. The only path that marks an email as sent.
//
// Guarantees:
//  - A draft is claimed atomically (draft or failed -> sending), so a double click cannot send twice.
//  - status becomes "sent" only after the SMTP server accepts the recipient.
//  - A failed attempt is recorded as "failed" with the error, and can be retried.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HarnessError, getOwnedJob } from '@/lib/harness/application';
import type { ApplicationEmail } from '@/lib/types/applications';
import type { Job } from '@/lib/types/jobs';
import { sendSmtpMessage } from './smtp';

const FOLLOW_UP_INTERVAL_DAYS = 7;

export async function sendApplicationEmail(
    supabase: SupabaseClient,
    userId: string,
    emailId: string
): Promise<ApplicationEmail> {
    const { data: email, error } = await supabase
        .from('application_emails')
        .select('*')
        .eq('id', emailId)
        .eq('user_id', userId)
        .single();

    if (error || !email) throw new HarnessError('Draft not found');

    const draft = email as ApplicationEmail;
    const job = await getOwnedJob(supabase, userId, draft.job_id);
    assertSendable(draft, job);

    // Applications always carry the resume that is current at send time, not the one from when the draft was made.
    const resumeId = draft.kind === 'application' ? await currentResumeId(supabase, userId) : null;

    // Atomic claim. If another request got here first, this matches no rows.
    const { data: claimed, error: claimError } = await supabase
        .from('application_emails')
        .update({ status: 'sending', error: null, resume_id: resumeId, updated_at: new Date().toISOString() })
        .eq('id', draft.id)
        .eq('user_id', userId)
        .in('status', ['draft', 'failed'])
        .select('*')
        .maybeSingle();

    if (claimError) throw new HarnessError(`Could not start sending: ${claimError.message}`);
    if (!claimed) throw new HarnessError('This email is already being sent or was sent');

    let messageId: string;
    try {
        const attachments = await resumeAttachment(supabase, userId, resumeId);
        messageId = await sendSmtpMessage({
            to: draft.to_email,
            subject: draft.subject,
            text: draft.body,
            messageId: `<${randomUUID()}@${senderDomain()}>`,
            inReplyTo: draft.in_reply_to,
            references: draft.references_header,
            attachments,
        });
    } catch (sendError) {
        // SMTP did not accept the message. Record the failure so the user can retry.
        const message = sendError instanceof Error ? sendError.message : 'Unknown error';
        await supabase
            .from('application_emails')
            .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
            .eq('id', draft.id)
            .eq('user_id', userId);
        throw new HarnessError(`The email was not sent: ${message}`);
    }

    // The message is out. If recording it fails, keep the status as "sending" and log the
    // message id, so nobody resends it by accident.
    const sentAt = new Date().toISOString();
    const { data: sent, error: recordError } = await supabase
        .from('application_emails')
        .update({ status: 'sent', sent_at: sentAt, message_id: messageId, error: null, updated_at: sentAt })
        .eq('id', draft.id)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (recordError || !sent) {
        console.error(`Email ${draft.id} was sent as ${messageId} but could not be recorded:`, recordError);
        throw new HarnessError('The email was sent, but its status could not be saved. Check the sent folder before retrying.');
    }

    await advanceJob(supabase, userId, job, draft, sentAt);

    return sent as ApplicationEmail;
}

function assertSendable(draft: ApplicationEmail, job: Job) {
    if (!draft.to_email) throw new HarnessError('This draft has no recipient');

    if (draft.kind === 'application' && job.status !== 'draft_created') {
        throw new HarnessError('Only a draft application can be sent for this job');
    }

    if (draft.kind === 'follow_up' && job.status !== 'sent' && job.status !== 'follow_up_1') {
        throw new HarnessError('The follow-up can only be sent after the application');
    }
}

async function currentResumeId(supabase: SupabaseClient, userId: string): Promise<string> {
    const { data, error } = await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', userId)
        .eq('is_current', true)
        .maybeSingle();

    if (error) throw new HarnessError('Could not look up your resume');
    if (!data) throw new HarnessError('Upload your resume in the profile before sending an application');
    return data.id;
}

// The resume goes out with the first application only. Follow-ups never carry it.
async function resumeAttachment(supabase: SupabaseClient, userId: string, resumeId: string | null) {
    if (!resumeId) return undefined;

    const { data: resume, error } = await supabase
        .from('resumes')
        .select('storage_path, file_name, content_type')
        .eq('id', resumeId)
        .eq('user_id', userId)
        .single();

    if (error || !resume) throw new HarnessError('The resume could not be found');

    const { data: file, error: downloadError } = await supabase.storage
        .from('resumes')
        .download(resume.storage_path);

    if (downloadError || !file) throw new HarnessError('The resume file could not be read');

    return [{
        filename: resume.file_name,
        content: Buffer.from(await file.arrayBuffer()),
        contentType: resume.content_type,
    }];
}

// Moves the job forward after a successful send. This replaces the n8n status write.
async function advanceJob(
    supabase: SupabaseClient,
    userId: string,
    job: Job,
    draft: ApplicationEmail,
    sentAt: string
) {
    const now = new Date(sentAt);
    const addDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

    const patch = draft.kind === 'application'
        ? { status: 'sent', sent_at: sentAt, follow_up_date: addDays(FOLLOW_UP_INTERVAL_DAYS), follow_up_count: 0 }
        : {
            status: draft.follow_up_number === 1 ? 'follow_up_1' : 'follow_up_2',
            follow_up_count: draft.follow_up_number,
            follow_up_date: draft.follow_up_number === 1 ? addDays(FOLLOW_UP_INTERVAL_DAYS) : null,
        };

    const { error } = await supabase.from('jobs').update(patch).eq('id', job.id).eq('user_id', userId);
    if (error) {
        console.error(`Email ${draft.id} sent, but the job ${job.id} status was not updated:`, error);
    }
}

function senderDomain(): string {
    const from = process.env.SMTP_FROM ?? '';
    const match = from.match(/@([^>\s]+)>?\s*$/);
    if (!match) throw new HarnessError('SMTP_FROM must contain an email address');
    return match[1];
}
