export type JobStatus = 'new' | 'draft_created' | 'sent' | 'follow_up_1' | 'follow_up_2' | 'replied' | 'closed_no_response';

export type RequirementPriority = 'required' | 'preferred' | 'responsibility';

export interface JobRequirement {
    text: string;
    priority: RequirementPriority;
    skill: string | null;
}

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
    requirements: JobRequirement[];
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
    gmail_draft_id: string | null;
    gmail_message_id: string | null;
    email_draft_link: string | null;
    thread_id: string | null;
    status: JobStatus;
    sent_at: string | null;
    follow_up_date: string | null;
    follow_up_count: number;
    analysis: JobAnalysis | null;
    analysis_version: number | null;
    analysis_hash: string | null;
    analyzed_at: string | null;
    created_at: string;
    user_id: string;
}

export interface JobFilters {
    status?: JobStatus | 'all';
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
