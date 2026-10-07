// Application harness: connects the steps and persists the results.
//
//   job description -> analysis -> matching -> evidence -> plan -> writer -> validation -> draft
//
// Every step is a plain function. Only the analysis and writing steps call the model.
// Nothing here sends mail. Sending is in lib/mail/send.ts and runs only on explicit user action.

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadProfile, profileIsUsable } from '@/lib/data/profile';
import { PermanentFollowUpError } from '@/lib/followups/policy';
import type { ApplicationEmail, GenerationRecord } from '@/lib/types/applications';
import type { Job, JobAnalysis } from '@/lib/types/jobs';
import type { ProfileSnapshot } from '@/lib/types/profile';
import { ANALYSIS_VERSION, analyzeJobDescription, hashJobDescription } from './analyze-job';
import { matchProfile } from './match';
import { buildWritingPlan } from './plan';
import { FOLLOW_UP_PROMPT_VERSION, PROMPT_VERSION, writeApplicationEmail, writeFollowUpEmail } from './write';
import { OPENAI_MODEL } from './openai';

const MAX_FOLLOW_UPS = 2;
const CLOSED_STATUSES = ['replied', 'closed_no_response'];

export class HarnessError extends Error {}

// ---------------------------------------------------------------------------
// Job helpers
// ---------------------------------------------------------------------------

export async function getOwnedJob(supabase: SupabaseClient, userId: string, jobId: string): Promise<Job> {
    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', userId)
        .single();

    if (error || !data) throw new HarnessError('Job not found');
    return data as Job;
}

// Runs the analysis once per distinct job description. The result is cached on the job row.
export async function ensureJobAnalysis(supabase: SupabaseClient, job: Job): Promise<JobAnalysis> {
    const hash = hashJobDescription(job.raw_post);
    if (job.analysis && job.analysis_hash === hash && job.analysis_version === ANALYSIS_VERSION) {
        return job.analysis;
    }

    const analysis = await analyzeJobDescription(job.raw_post, job.id);

    // Fill fields the user has not set. Existing values are never overwritten.
    const { error } = await supabase
        .from('jobs')
        .update({
            analysis,
            analysis_hash: hash,
            analysis_version: ANALYSIS_VERSION,
            analyzed_at: new Date().toISOString(),
            title: job.title ?? analysis.title,
            company: job.company ?? analysis.company,
            recruiter_name: job.recruiter_name ?? analysis.recruiter_name,
            recruiter_email: job.recruiter_email ?? analysis.recruiter_email,
            location: job.location ?? analysis.location,
            work_type: job.work_type ?? analysis.work_type,
            experience: job.experience ?? analysis.experience,
            timings: job.timings ?? analysis.timings,
            skills: job.skills ?? analysis.requirements.filter((r) => r.skill).map((r) => r.skill!),
        })
        .eq('id', job.id)
        .eq('user_id', job.user_id);

    if (error) throw new HarnessError(`Could not save job analysis: ${error.message}`);
    return analysis;
}

// ---------------------------------------------------------------------------
// Initial application
// ---------------------------------------------------------------------------

export async function createApplicationDraft(
    supabase: SupabaseClient,
    userId: string,
    jobId: string,
    options: { note?: string | null } = {}
): Promise<ApplicationEmail> {
    const job = await getOwnedJob(supabase, userId, jobId);

    if (CLOSED_STATUSES.includes(job.status) || job.status === 'sent' || job.status.startsWith('follow_up')) {
        throw new HarnessError('This application has already been sent');
    }

    const profile = await loadProfile(supabase, userId);
    if (!profileIsUsable(profile)) {
        throw new HarnessError('Add at least one experience or project to your profile first');
    }

    const analysis = await ensureJobAnalysis(supabase, job);

    if (!analysis.requirements.length) {
        throw new HarnessError('No requirements could be read from this job description');
    }

    const match = matchProfile(analysis, profile);
    if (match.evidence.length === 0) {
        throw new HarnessError('No experience or project in your profile matches this job. Add evidence for the skills it asks for.');
    }

    const recipient = job.recruiter_email ?? analysis.recruiter_email;
    if (!recipient) {
        throw new HarnessError('This posting has no recruiter email. Add one to the job before creating a draft.');
    }

    const plan = buildWritingPlan({ analysis, profile, match, includeLinks: true });

    const { email, attempts } = await writeApplicationEmail({
        jobId: job.id,
        analysis,
        plan,
        evidence: match.evidence,
        profile,
        sourceText: `${job.raw_post}\n${yearsIn(profile).join(' ')}`,
        userNote: options.note ?? null,
    });

    const body = `${email.body.trim()}\n\n${signature(profile, plan.include_links.length > 0)}`;

    const generation: GenerationRecord = {
        model: OPENAI_MODEL,
        prompt_version: PROMPT_VERSION,
        attempts,
        generated_at: new Date().toISOString(),
        plan,
        evidence: match.evidence,
        citations: email.citations,
        previous_email_id: null,
        user_note: options.note ?? null,
    };

    // Replacing an unsent draft keeps one current draft per job. Sent mail is never touched.
    await supabase
        .from('application_emails')
        .delete()
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .eq('kind', 'application')
        .eq('status', 'draft');

    const { data, error } = await supabase
        .from('application_emails')
        .insert({
            user_id: userId,
            job_id: job.id,
            kind: 'application',
            status: 'draft',
            subject: email.subject.trim(),
            body,
            to_email: recipient,
            resume_id: profile.resume?.id ?? null,
            generation,
        })
        .select('*')
        .single();

    if (error || !data) throw new HarnessError(`Could not save the draft: ${error?.message}`);

    if (job.status === 'new' || job.status === 'draft_created') {
        await supabase.from('jobs').update({ status: 'draft_created' }).eq('id', job.id).eq('user_id', userId);
    }

    return data as ApplicationEmail;
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

export interface FollowUpContent {
    subject: string;
    body: string;
    generation: GenerationRecord;
    previous: { id: string; to_email: string; message_id: string | null; references_header: string | null };
}

// The one place follow-up text is written. Manual drafts and scheduled follow-ups both call it.
// Follow-ups use the earlier email and the job only. They carry no profile links and no resume.
export async function generateFollowUpContent(
    supabase: SupabaseClient,
    userId: string,
    job: Job,
    followUpNumber: number
): Promise<FollowUpContent> {
    const { data: previous, error: previousError } = await supabase
        .from('application_emails')
        .select('*')
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (previousError) throw new HarnessError(`Could not load the earlier email: ${previousError.message}`);
    if (!previous) throw new PermanentFollowUpError('NO_PREVIOUS_SENT', 'No sent email was found for this job');

    const profile = await loadProfile(supabase, userId);
    const daysSinceSent = Math.max(0, Math.round((Date.now() - new Date(previous.sent_at).getTime()) / 86_400_000));

    const { email, attempts } = await writeFollowUpEmail({
        jobId: job.id,
        job: { title: job.title, company: job.company, recruiter_name: job.recruiter_name },
        previous: { subject: previous.subject, body: previous.body, sent_at: previous.sent_at },
        followUpNumber,
        daysSinceSent,
        profile,
    });

    return {
        subject: email.subject.trim(),
        body: `${email.body.trim()}\n\n${signature(profile, false)}`,
        generation: {
            model: OPENAI_MODEL,
            prompt_version: FOLLOW_UP_PROMPT_VERSION,
            attempts,
            generated_at: new Date().toISOString(),
            plan: null,
            evidence: [],
            citations: [],
            previous_email_id: previous.id,
        },
        previous: {
            id: previous.id,
            to_email: previous.to_email,
            message_id: previous.message_id,
            references_header: previous.references_header,
        },
    };
}

export async function createFollowUpDraft(
    supabase: SupabaseClient,
    userId: string,
    jobId: string
): Promise<ApplicationEmail> {
    const job = await getOwnedJob(supabase, userId, jobId);

    if (job.status !== 'sent' && job.status !== 'follow_up_1') {
        throw new HarnessError('Follow-ups can only be drafted after the application is sent');
    }

    const followUpNumber = (job.follow_up_count ?? 0) + 1;
    if (followUpNumber > MAX_FOLLOW_UPS) {
        throw new HarnessError('The maximum number of follow-ups has been reached');
    }

    // A scheduled follow-up for this number would send alongside a manual draft. Refuse instead.
    const { data: live } = await supabase
        .from('application_emails')
        .select('id')
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .eq('kind', 'follow_up')
        .eq('follow_up_number', followUpNumber)
        .in('status', ['scheduled', 'processing'])
        .limit(1)
        .maybeSingle();

    if (live) throw new HarnessError('A follow-up is already scheduled for this application');

    let content: FollowUpContent;
    try {
        content = await generateFollowUpContent(supabase, userId, job, followUpNumber);
    } catch (error) {
        if (error instanceof PermanentFollowUpError) throw new HarnessError(error.message);
        throw error;
    }

    const references = [content.previous.references_header, content.previous.message_id].filter(Boolean).join(' ');

    await supabase
        .from('application_emails')
        .delete()
        .eq('job_id', job.id)
        .eq('user_id', userId)
        .eq('kind', 'follow_up')
        .eq('status', 'draft');

    const { data, error } = await supabase
        .from('application_emails')
        .insert({
            user_id: userId,
            job_id: job.id,
            kind: 'follow_up',
            follow_up_number: followUpNumber,
            status: 'draft',
            subject: content.subject,
            body: content.body,
            to_email: content.previous.to_email,
            resume_id: null,
            in_reply_to: content.previous.message_id,
            references_header: references || null,
            generation: content.generation,
        })
        .select('*')
        .single();

    if (error || !data) throw new HarnessError(`Could not save the follow-up: ${error?.message}`);
    return data as ApplicationEmail;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signature(profile: ProfileSnapshot, includeLinks: boolean): string {
    const lines = [profile.details.full_name ? `Best regards,\n${profile.details.full_name}` : 'Best regards'];

    if (includeLinks) {
        const links = [
            profile.details.linkedin_url && `LinkedIn: ${profile.details.linkedin_url}`,
            profile.details.github_url && `GitHub: ${profile.details.github_url}`,
            profile.details.portfolio_url && `Portfolio: ${profile.details.portfolio_url}`,
        ].filter(Boolean);
        if (links.length) lines.push(links.join('\n'));
    }

    return lines.join('\n');
}

// Years that appear in the profile. The writer may cite them, so validation must allow them.
function yearsIn(profile: ProfileSnapshot): string[] {
    const dates = [
        ...profile.experiences.flatMap((e) => [e.start_date, e.end_date]),
        ...profile.projects.flatMap((p) => [p.start_date, p.end_date]),
    ];
    return dates
        .filter((d): d is string => Boolean(d))
        .map((d) => d.slice(0, 4));
}
