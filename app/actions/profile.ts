'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { detailsSchema, experienceSchema, projectSchema, skillSchema } from '@/lib/validation/profile';
import { requireUser } from '@/lib/supabase/server';
import { normalizeText } from '@/lib/harness/text';
import type { ActionResult } from '@/lib/types/actions';
import { toResumeSummary, type ResumeSummary } from '@/lib/types/profile';

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const RESUME_TYPES = ['application/pdf'];

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
export async function uploadResume(formData: FormData): Promise<ActionResult<ResumeSummary>> {
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

    // Insert as not current first. If anything fails after this point, the previous resume stays current.
    const { data, error } = await supabase
        .from('resumes')
        .insert({
            id: resumeId,
            user_id: user.id,
            storage_path: storagePath,
            file_name: file.name.slice(0, 200),
            content_type: file.type,
            size_bytes: file.size,
            is_current: false,
        })
        .select('id, storage_path, file_name, content_type, size_bytes, created_at')
        .single();

    if (error || !data) {
        await supabase.storage.from('resumes').remove([storagePath]);
        return dbFailure('Could not save resume', error ?? { message: 'Not found' });
    }

    // The partial unique index allows one current row, so the old one is unmarked before the new one is marked.
    // Old rows and files are kept so applications that already used them keep a valid reference.
    const { error: unmarkError } = await supabase
        .from('resumes')
        .update({ is_current: false })
        .eq('user_id', user.id)
        .eq('is_current', true)
        .neq('id', resumeId);

    const { error: markError } = unmarkError
        ? { error: unmarkError }
        : await supabase.from('resumes').update({ is_current: true }).eq('id', resumeId).eq('user_id', user.id);

    if (markError) {
        await supabase.from('resumes').delete().eq('id', resumeId).eq('user_id', user.id);
        await supabase.storage.from('resumes').remove([storagePath]);
        return dbFailure('Could not save resume', markError);
    }

    revalidatePath('/dashboard/profile');
    return { success: true, data: toResumeSummary(data) };
}

// Short-lived link to the current resume. The storage path is never sent to the browser.
export async function getCurrentResumeUrl(): Promise<ActionResult<{ url: string; fileName: string }>> {
    const { supabase, user } = await requireUser();

    const { data: resume, error } = await supabase
        .from('resumes')
        .select('storage_path, file_name')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .maybeSingle();

    if (error) return dbFailure('Could not load resume', error);
    if (!resume) return { success: false, message: 'No resume uploaded yet' };

    const { data, error: signError } = await supabase.storage
        .from('resumes')
        .createSignedUrl(resume.storage_path, 300);

    if (signError || !data) return dbFailure('Could not open resume', signError ?? { message: 'Not found' });
    return { success: true, data: { url: data.signedUrl, fileName: resume.file_name } };
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
