// Application emails (drafts, sent mail, follow-ups) and the harness outputs
// that are stored with them for inspection.

export type ApplicationEmailKind = 'application' | 'follow_up';
export type ApplicationEmailStatus = 'draft' | 'sending' | 'sent' | 'failed';

export interface ApplicationEmail {
    id: string;
    job_id: string;
    kind: ApplicationEmailKind;
    follow_up_number: number | null;
    status: ApplicationEmailStatus;
    subject: string;
    body: string;
    to_email: string;
    resume_id: string | null;
    message_id: string | null;
    in_reply_to: string | null;
    references_header: string | null;
    sent_at: string | null;
    error: string | null;
    generation: GenerationRecord | null;
    created_at: string;
    updated_at: string;
}

// A piece of profile evidence the writer is allowed to use. IDs are stable within one run.
export interface EvidenceItem {
    id: string;            // short ID shown to the model, e.g. "E1"
    source: 'experience' | 'project';
    source_id: string;     // experiences.id or projects.id
    source_name: string;   // company + role, or project name
    text: string;          // a single bullet, achievement, or description
    skills: string[];      // skill names linked to the source
    score: number;
}

export interface WritingPlan {
    role: string;
    company: string | null;
    requested_skills: { name: string; priority: 'required' | 'preferred' }[];
    matched_skills: string[];
    gap_skills: string[];        // requested by the job, absent from profile. Must not be claimed.
    evidence_ids: string[];
    include_links: { label: string; url: string }[];
    max_words: number;
}

export interface Citation {
    sentence: string;
    evidence_ids: string[];
}

// Stored with every generated email in application_emails.generation.
export interface GenerationRecord {
    model: string;
    prompt_version: string;
    attempts: number;
    generated_at: string;
    plan: WritingPlan | null;
    evidence: EvidenceItem[];
    citations: Citation[];
    previous_email_id: string | null;   // follow-ups only
}

export interface GeneratedEmail {
    subject: string;
    body: string;
    citations: Citation[];
    skills_referenced: string[];
}
