import type { SupabaseClient } from '@supabase/supabase-js';
import type { Experience, Project, ProfileDetails, ProfileSkill, ProfileSnapshot, Resume } from '@/lib/types/profile';

const EMPTY_DETAILS: ProfileDetails = {
    full_name: null,
    headline: null,
    location: null,
    phone: null,
    contact_email: null,
    summary: null,
    linkedin_url: null,
    github_url: null,
    portfolio_url: null,
};

// Loads the whole profile for one user in five queries. Every query is scoped to user_id,
// so this stays correct even if row level security is misconfigured.
export async function loadProfile(supabase: SupabaseClient, userId: string): Promise<ProfileSnapshot> {
    const [details, skills, experiences, experienceSkills, projects, projectSkills, resume] = await Promise.all([
        supabase.from('profiles').select('full_name, headline, location, phone, contact_email, summary, linkedin_url, github_url, portfolio_url').eq('user_id', userId).maybeSingle(),
        supabase.from('profile_skills').select('id, name, normalized_name, aliases').eq('user_id', userId).order('name'),
        supabase.from('experiences').select('*').eq('user_id', userId).order('position').order('start_date', { ascending: false }),
        supabase.from('experience_skills').select('experience_id, skill_id').eq('user_id', userId),
        supabase.from('projects').select('*').eq('user_id', userId).order('position'),
        supabase.from('project_skills').select('project_id, skill_id').eq('user_id', userId),
        supabase.from('resumes').select('id, storage_path, file_name, content_type, size_bytes, created_at').eq('user_id', userId).eq('is_current', true).maybeSingle(),
    ]);

    for (const result of [details, skills, experiences, experienceSkills, projects, projectSkills, resume]) {
        if (result.error) throw new Error(`Could not load profile: ${result.error.message}`);
    }

    const skillsByExperience = groupIds(experienceSkills.data ?? [], 'experience_id');
    const skillsByProject = groupIds(projectSkills.data ?? [], 'project_id');

    return {
        details: { ...EMPTY_DETAILS, ...(details.data ?? {}) },
        skills: (skills.data ?? []) as ProfileSkill[],
        experiences: (experiences.data ?? []).map((row): Experience => ({
            id: row.id,
            company: row.company,
            role: row.role,
            location: row.location,
            start_date: row.start_date,
            end_date: row.end_date,
            responsibilities: row.responsibilities ?? [],
            achievements: row.achievements ?? [],
            skill_ids: skillsByExperience.get(row.id) ?? [],
        })),
        projects: (projects.data ?? []).map((row): Project => ({
            id: row.id,
            name: row.name,
            url: row.url,
            description: row.description,
            contribution: row.contribution,
            start_date: row.start_date,
            end_date: row.end_date,
            skill_ids: skillsByProject.get(row.id) ?? [],
        })),
        resume: (resume.data as Resume | null) ?? null,
    };
}

function groupIds(rows: Record<string, string>[], key: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const row of rows) {
        const group = map.get(row[key]) ?? [];
        group.push(row.skill_id);
        map.set(row[key], group);
    }
    return map;
}

export function profileIsUsable(profile: ProfileSnapshot): boolean {
    return profile.experiences.length > 0 || profile.projects.length > 0;
}
