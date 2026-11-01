export type JobStatus = 'new' | 'draft_created' | 'sent' | 'follow_up_1' | 'follow_up_2' | 'awaiting_review' | 'replied' | 'closed_no_response';

// Output of the job analysis step. Cached in jobs.analysis.
export interface JobAnalysis {
    title: string | null;
    company: string | null;
    recruiter_name: string | null;
    recruiter_email: string | null;
    location: string | null;
    work_type: string | null;
    experience: string | null;
    timings: string | null;
    summary: string;
    requirements: string[];    // requirement/responsibility sentences, for the writer's context
    skills: string[];          // named technologies the posting mentions, for the gap-skill check
}

export interface Job {
    id: string;
    raw_post: string;
    title: string | null;
    company: string | null;
    recruiter_name: string | null;
    recruiter_email: string | null;
    location: string | null;
    work_type: string | null;
    experience: string | null;
    skills: string[] | null;
    timings: string | null;
    thread_id: string | null;
    status: JobStatus;
    sent_at: string | null;
    follow_up_date: string | null;
    follow_up_count: number;
    analysis: JobAnalysis | null;
    analysis_version: number | null;
    analysis_hash: string | null;
    analyzed_at: string | null;
    replied_at: string | null;
    reply_message_id: string | null;
    reply_match: string | null;
    // Set for every classified reply, including holding/auto_reply ones that leave status untouched.
    reply_classification: string | null;
    // Dedup cursor for holding/auto_reply replies, which don't change reply_message_id/status.
    last_inbound_message_id: string | null;
    dismissed_at: string | null;
    // Soft delete. Hidden everywhere except the Deleted list, which can restore it.
    deleted_at: string | null;
    created_at: string;
    user_id: string;
}

export interface JobFilters {
    status?: JobStatus | 'all';
    followUp?: 'upcoming' | 'failed' | 'cancelled';
    company?: string;
    location?: string;
    work_type?: string;
    search?: string;
}

export interface JobsResponse {
    data: Job[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface SendEmailResponse {
    success: boolean;
    message: string;
    error?: string;
}
