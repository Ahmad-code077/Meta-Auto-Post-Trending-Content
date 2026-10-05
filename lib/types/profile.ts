// Personal profile as stored in Supabase. One profile per user.

export interface ProfileDetails {
    full_name: string | null
    headline: string | null
    location: string | null
    phone: string | null
    contact_email: string | null
    summary: string | null
    linkedin_url: string | null
    github_url: string | null
    portfolio_url: string | null
}

export interface ProfileSkill {
    id: string
    name: string
    normalized_name: string
    aliases: string[]
}

export interface Experience {
    id: string
    company: string
    role: string
    location: string | null
    start_date: string | null
    end_date: string | null
    responsibilities: string[]
    achievements: string[]
    skill_ids: string[]
}

export interface Project {
    id: string
    name: string
    url: string | null
    description: string | null
    contribution: string | null
    start_date: string | null
    end_date: string | null
    skill_ids: string[]
}

export interface Resume {
    id: string
    storage_path: string
    file_name: string
    content_type: string
    size_bytes: number
    created_at: string
}

// Everything the harness needs, loaded in one call.
export interface ProfileSnapshot {
    details: ProfileDetails
    skills: ProfileSkill[]
    experiences: Experience[]
    projects: Project[]
    resume: Resume | null
}
