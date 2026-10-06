// Sends reviewed drafts and scheduled follow-ups over SMTP. The only path that marks an email as sent.
//
// Guarantees:
//  - A user-triggered send claims the draft atomically (draft or failed -> sending). A double click cannot send twice.
//  - status becomes "sent" only after the SMTP server accepts the recipient.
//  - A failed attempt is recorded as "failed" with the error, so it can be retried by hand.
//  - Scheduled follow-ups use the same transport (transmitEmail) and the same job update (advanceJobAfterSend).
//    The scheduler adds its own claim and retry rules on top; see lib/followups/scheduler.ts.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HarnessError, getOwnedJob } from '@/lib/harness/application';
import { logger, errorFields } from '@/lib/log/logger';
import { followUpDueAt } from '@/lib/followups/policy';
import type { ApplicationEmail } from '@/lib/types/applications';
import type { Job } from '@/lib/types/jobs';
import { readSmtpSettings, resolveSender, sendSmtpMessage } from './smtp';

export interface OutgoingEmail {
    id: string;
    to_email: string;
    subject: string;
    body: string;
    in_reply_to: string | null;
    references_header: string | null;
}

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
    await assertSendable(supabase, userId, draft, job);

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
        // assertSendable has already rejected drafts without text, so the nulls are safe to default here.
        messageId = await transmitEmail(supabase, userId, { ...draft, subject: draft.subject ?? '', body: draft.body ?? '' }, resumeId);
    } catch (sendError) {
        // SMTP did not accept the message. Record the failure so the user can retry.
        const message = sendError instanceof Error ? sendError.message : 'Unknown error';
        logger.error('email.send.failed', { email_id: draft.id, job_id: draft.job_id, kind: draft.kind, ...errorFields(sendError) });
        await supabase
            .from('application_emails')
            .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
            .eq('id', draft.id)
            .eq('user_id', userId);
        throw new HarnessError(`The email was not sent: ${message}`);
    }

    // The message is out. If recording it fails, keep the status as "sending" and log the
    // message id, so nobody resends it by accident.
    const sentAt = new Date();
    const { data: sent, error: recordError } = await supabase
        .from('application_emails')
        .update({ status: 'sent', sent_at: sentAt.toISOString(), message_id: messageId, error: null, updated_at: sentAt.toISOString() })
        .eq('id', draft.id)
        .eq('user_id', userId)
        .select('*')
        .single();

    if (recordError || !sent) {
        logger.error('email.record_failed', { email_id: draft.id, job_id: draft.job_id, message_id: messageId });
        throw new HarnessError('The email was sent, but its status could not be saved. Check the sent folder before retrying.');
    }

    logger.info('email.sent', { email_id: draft.id, job_id: draft.job_id, kind: draft.kind, message_id: messageId });
    await advanceJobAfterSend(supabase, userId, job, draft, sentAt, messageId);

    return sent as ApplicationEmail;
}

// Builds the message and hands it to the SMTP transport. Returns the Message-ID that was sent.
// Used by the user-triggered send and by the scheduler, so there is one SMTP path.
export async function transmitEmail(
    supabase: SupabaseClient,
    userId: string,
    email: OutgoingEmail,
    resumeId: string | null
): Promise<string> {
    const attachments = await resumeAttachment(supabase, userId, resumeId);
    return sendSmtpMessage({
        to: email.to_email,
        subject: email.subject,
        text: email.body,
        messageId: `<${randomUUID()}@${senderDomain()}>`,
        inReplyTo: email.in_reply_to,
        references: email.references_header,
        attachments,
    });
}

// Moves the job forward after a successful send, and keeps follow-ups consistent with it.
//  - An application schedules follow-up 1 for FOLLOW_UP_DELAY_DAYS later.
//  - A sent follow-up cancels any other scheduled follow-up with the same number, so it cannot send twice.
// Failures here are logged, not thrown. The email has already been sent, so the send itself stands.
export async function advanceJobAfterSend(
    supabase: SupabaseClient,
    userId: string,
    job: Job,
    email: Pick<ApplicationEmail, 'id' | 'kind' | 'follow_up_number' | 'to_email' | 'references_header'>,
    sentAt: Date,
    messageId: string
): Promise<void> {
    const sentAtIso = sentAt.toISOString();
    const dueAt = followUpDueAt(sentAt).toISOString();

    const patch = email.kind === 'application'
        ? { status: 'sent', sent_at: sentAtIso, follow_up_date: dueAt, follow_up_count: 0 }
        : {
            status: email.follow_up_number === 1 ? 'follow_up_1' : 'follow_up_2',
            follow_up_count: email.follow_up_number,
            follow_up_date: email.follow_up_number === 1 ? dueAt : null,
        };

    const { error } = await supabase.from('jobs').update(patch).eq('id', job.id).eq('user_id', userId);
    if (error) {
        logger.error('job.update_failed', { job_id: job.id, email_id: email.id, error_code: error.code ?? null });
    }

    if (email.kind === 'application') {
        const { error: scheduleError } = await supabase.from('application_emails').insert({
            user_id: userId,
            job_id: job.id,
            kind: 'follow_up',
            follow_up_number: 1,
            status: 'scheduled',
            due_at: dueAt,
            subject: null,
            body: null,
            to_email: email.to_email,
            in_reply_to: messageId,
            references_header: [email.references_header, messageId].filter(Boolean).join(' ') || null,
        });

        if (scheduleError) {
            logger.error('followup.schedule_failed', { job_id: job.id, error_code: scheduleError.code ?? null });
        } else {
            logger.info('followup.scheduled', { job_id: job.id, due_at: dueAt, follow_up_number: 1 });
        }
        return;
    }

    const { error: cancelError } = await supabase
        .from('application_emails')
        .update({ status: 'cancelled', error: 'Superseded by a sent follow-up', error_code: 'SUPERSEDED', updated_at: sentAtIso })
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .eq('kind', 'follow_up')
        .eq('follow_up_number', email.follow_up_number)
        .eq('status', 'scheduled')
        .neq('id', email.id);

    if (cancelError) {
        logger.error('followup.cancel_failed', { job_id: job.id, error_code: cancelError.code ?? null });
    }
}

async function assertSendable(supabase: SupabaseClient, userId: string, draft: ApplicationEmail, job: Job) {
    if (!draft.to_email) throw new HarnessError('This draft has no recipient');

    if (draft.kind === 'application' && job.status !== 'draft_created') {
        throw new HarnessError('Only a draft application can be sent for this job');
    }

    if (draft.kind === 'follow_up') {
        if (job.status !== 'sent' && job.status !== 'follow_up_1') {
            throw new HarnessError('The follow-up can only be sent after the application');
        }
        if (!draft.subject || !draft.body) {
            throw new HarnessError('This follow-up has not been written yet');
        }

        // A scheduler run may be sending this follow-up number right now.
        const { data: inFlight } = await supabase
            .from('application_emails')
            .select('id')
            .eq('job_id', draft.job_id)
            .eq('user_id', userId)
            .eq('kind', 'follow_up')
            .eq('follow_up_number', draft.follow_up_number)
            .eq('status', 'processing')
            .limit(1)
            .maybeSingle();

        if (inFlight) throw new HarnessError('This follow-up is being sent right now');
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

// The Message-ID domain is the From domain, so the two line up for DMARC.
function senderDomain(): string {
    let sender;
    try {
        sender = resolveSender(readSmtpSettings());
    } catch (error) {
        throw new HarnessError(error instanceof Error ? error.message : 'SMTP is not configured');
    }
    return sender.address.split('@')[1];
}
