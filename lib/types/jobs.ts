export type JobStatus = 'draft_created' | 'sent' | 'follow_up_1' | 'follow_up_2';

export type WorkType = 'remote' | 'hybrid' | 'onsite' | 'contract' | 'full-time' | 'part-time';

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
    email_draft_link: string | null;
    status: JobStatus;
    sent_at: string | null;
    follow_up_date: string | null;
    follow_up_count: number;
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
