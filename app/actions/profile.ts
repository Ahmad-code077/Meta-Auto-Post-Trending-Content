'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/supabase/server';
import { normalizeText } from '@/lib/harness/text';
import type { ActionResult } from '@/lib/types/actions';
import type { Resume } from '@/lib/types/profile';

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES = ['application/pdf'];

const optionalText = (max: number) =>
    z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const optionalUrl = z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^https?:\/\/\S+$/.test(v), 'Enter a full URL starting with https://');

const optionalDate = z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a date in YYYY-MM-DD format');

const detailsSchema = z.object({
    full_name: optionalText(120),
    headline: optionalText(160),
    location: optionalText(120),
    phone: optionalText(40),
    contact_email: z.string().trim().email().max(200).optional().or(z.literal('')).transform((v) => (v ? v : null)),
    summary: optionalText(1200),
    linkedin_url: optionalUrl,
    github_url: optionalUrl,
    portfolio_url: optionalUrl,
});

const skillSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Skill name is required').max(60),
    aliases: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

const experienceSchema = z.object({
    id: z.string().uuid().optional(),
    company: z.string().trim().min(1, 'Company is required').max(120),
    role: z.string().trim().min(1, 'Role is required').max(120),
    location: optionalText(120),
    start_date: optionalDate,
    end_date: optionalDate,
    responsibilities: z.array(z.string().trim().min(1).max(400)).max(30).default([]),
    achievements: z.array(z.string().trim().min(1).max(400)).max(30).default([]),
    skill_ids: z.array(z.string().uuid()).max(60).default([]),
});

const projectSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Project name is required').max(120),
    url: optionalUrl,
    description: optionalText(1200),
    contribution: optionalText(1200),
    start_date: optionalDate,
    end_date: optionalDate,
    skill_ids: z.array(z.string().uuid()).max(60).default([]),
});

export type ProfileDetailsInput = z.input<typeof detailsSchema>;
export type SkillInput = z.input<typeof skillSchema>;
export type ExperienceInput = z.input<typeof experienceSchema>;
export type ProjectInput = z.input<typeof projectSchema>;

function invalid(error: z.ZodError): { success: false; message: string } {
    return { success: false, message: error.issues[0]?.message ?? 'Check the highlighted fields' };
}

function dbFailure(message: string, error: { code?: string; message: string }) {
    if (error.code === '23505') return { success: false as const, message: 'You already have a skill with this name' };
    console.error(message, error);
    return { success: false as const, message };
}

export async function saveProfileDetails(input: ProfileDetailsInput): Promise<ActionResult> {
    const parsed = detailsSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const { supabase, user } = await requireUser();
    const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() });

    if (error) return dbFailure('Could not save profile', error);
    revalidatePath('/dashboard/profile');
    return { success: true };
}

export async function saveSkill(input: SkillInput): Promise<ActionResult<{ id: string }>> {
    const parsed = skillSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);

    const { supabase, user } = await requireUser();
    const row = {
        user_id: user.id,
        name: parsed.data.name,
        normalized_name: normalizeText(parsed.data.name),
        aliases: parsed.data.aliases.map((a) => a.trim()).filter(Boolean),
    };

    const query = parsed.data.id
        ? supabase.from('profile_skills').update(row).eq('id', parsed.data.id).eq('user_id', user.id)
        : supabase.from('profile_skills').insert(row);

    const { data, error } = await query.select('id').single();
    if (error || !data) return dbFailure('Could not save skill', error ?? { message: 'Not found' });

    revalidatePath('/dashboard/profile');
    return { success: true, data: { id: data.id } };
}

export async function deleteSkill(id: string): Promise<ActionResult> {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from('profile_skills').delete().eq('id', id).eq('user_id', user.id);
    if (error) return dbFailure('Could not delete skill', error);
    revalidatePath('/dashboard/profile');
    return { success: true };
}

export async function saveExperience(input: ExperienceInput): Promise<ActionResult<{ id: string }>> {
    const parsed = experienceSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, skill_ids, ...fields } = parsed.data;

    const { supabase, user } = await requireUser();
    if (!(await ownsSkills(supabase, user.id, skill_ids))) {
        return { success: false, message: 'One of the selected skills does not belong to your profile' };
    }

    const row = { ...fields, user_id: user.id, updated_at: new Date().toISOString() };
    const query = id
        ? supabase.from('experiences').update(row).eq('id', id).eq('user_id', user.id)
        : supabase.from('experiences').insert(row);

    const { data, error } = await query.select('id').single();
    if (error || !data) return dbFailure('Could not save experience', error ?? { message: 'Not found' });

    await replaceLinks(supabase, 'experience_skills', 'experience_id', data.id, user.id, skill_ids);
    revalidatePath('/dashboard/profile');
    return { success: true, data: { id: data.id } };
}

export async function deleteExperience(id: string): Promise<ActionResult> {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from('experiences').delete().eq('id', id).eq('user_id', user.id);
    if (error) return dbFailure('Could not delete experience', error);
    revalidatePath('/dashboard/profile');
    return { success: true };
}

export async function saveProject(input: ProjectInput): Promise<ActionResult<{ id: string }>> {
    const parsed = projectSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const { id, skill_ids, ...fields } = parsed.data;

    const { supabase, user } = await requireUser();
    if (!(await ownsSkills(supabase, user.id, skill_ids))) {
        return { success: false, message: 'One of the selected skills does not belong to your profile' };
    }

    const row = { ...fields, user_id: user.id, updated_at: new Date().toISOString() };
    const query = id
        ? supabase.from('projects').update(row).eq('id', id).eq('user_id', user.id)
        : supabase.from('projects').insert(row);

    const { data, error } = await query.select('id').single();
    if (error || !data) return dbFailure('Could not save project', error ?? { message: 'Not found' });

    await replaceLinks(supabase, 'project_skills', 'project_id', data.id, user.id, skill_ids);
    revalidatePath('/dashboard/profile');
    return { success: true, data: { id: data.id } };
}

export async function deleteProject(id: string): Promise<ActionResult> {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
    if (error) return dbFailure('Could not delete project', error);
    revalidatePath('/dashboard/profile');
    return { success: true };
}

// Replaces the current resume. The old file stays in storage so sent applications keep
// pointing at the version they used.
export async function uploadResume(formData: FormData): Promise<ActionResult<Resume>> {
    const file = formData.get('resume');
    if (!(file instanceof File) || file.size === 0) {
        return { success: false, message: 'Choose a resume file' };
    }
    if (!RESUME_TYPES.includes(file.type)) {
        return { success: false, message: 'The resume must be a PDF' };
    }
    if (file.size > RESUME_MAX_BYTES) {
        return { success: false, message: 'The resume must be 5 MB or smaller' };
    }

    const { supabase, user } = await requireUser();
    const resumeId = randomUUID();
    const storagePath = `${user.id}/${resumeId}.pdf`;

    const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadError) return dbFailure('Could not upload resume', uploadError);

    // Unmark the previous resume first. The partial unique index allows only one current row.
    await supabase.from('resumes').update({ is_current: false }).eq('user_id', user.id).eq('is_current', true);

    const { data, error } = await supabase
        .from('resumes')
        .insert({
            id: resumeId,
            user_id: user.id,
            storage_path: storagePath,
            file_name: file.name.slice(0, 200),
            content_type: file.type,
            size_bytes: file.size,
            is_current: true,
        })
        .select('id, storage_path, file_name, content_type, size_bytes, created_at')
        .single();

    if (error || !data) {
        await supabase.storage.from('resumes').remove([storagePath]);
        return dbFailure('Could not save resume', error ?? { message: 'Not found' });
    }

    revalidatePath('/dashboard/profile');
    return { success: true, data: data as Resume };
}

async function ownsSkills(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], userId: string, ids: string[]) {
    if (ids.length === 0) return true;
    const { data, error } = await supabase
        .from('profile_skills')
        .select('id')
        .eq('user_id', userId)
        .in('id', ids);
    return !error && (data?.length ?? 0) === new Set(ids).size;
}

async function replaceLinks(
    supabase: Awaited<ReturnType<typeof requireUser>>['supabase'],
    table: 'experience_skills' | 'project_skills',
    column: 'experience_id' | 'project_id',
    parentId: string,
    userId: string,
    skillIds: string[]
) {
    await supabase.from(table).delete().eq(column, parentId).eq('user_id', userId);
    if (skillIds.length) {
        await supabase.from(table).insert(skillIds.map((skill_id) => ({ [column]: parentId, skill_id, user_id: userId })));
    }
}
