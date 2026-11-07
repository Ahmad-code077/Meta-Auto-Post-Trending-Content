'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/supabase/server';
import { parseIdeaLines } from '@/lib/linkedin-ideas/parse';
import type { ActionResult } from '@/lib/types/actions';
import type { IdeaStatus } from '@/lib/types/linkedin-ideas';

const IDEAS_PATH = '/dashboard/linkedin-ideas';
const TITLE_MAX = 500;
const BODY_MAX = 10000;

function failure(error: unknown, fallback: string): { success: false; message: string } {
    console.error(fallback, error);
    return { success: false, message: fallback };
}

// One idea per pasted line, appended to the end of the Idea column in the order pasted.
export async function bulkCreateIdeas(text: string): Promise<ActionResult<{ created: number }>> {
    try {
        const lines = parseIdeaLines(text).map((line) => line.slice(0, TITLE_MAX));
        if (lines.length === 0) return { success: false, message: 'Paste at least one idea, one per line' };

        const { supabase, user } = await requireUser();

        const { data: last, error: lastError } = await supabase
            .from('linkedin_ideas')
            .select('position')
            .eq('user_id', user.id)
            .eq('status', 'idea')
            .order('position', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (lastError) throw lastError;

        const startPosition = (last?.position ?? 0) + 1;
        const rows = lines.map((title, index) => ({
            user_id: user.id,
            title,
            status: 'idea' as const,
            position: startPosition + index,
        }));

        const { error } = await supabase.from('linkedin_ideas').insert(rows);
        if (error) throw error;

        revalidatePath(IDEAS_PATH);
        return { success: true, data: { created: rows.length } };
    } catch (error) {
        return failure(error, 'Could not add those ideas');
    }
}

export async function updateIdea(id: string, input: { title?: string; body?: string }): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const patch: Record<string, string> = { updated_at: new Date().toISOString() };
        if (input.title !== undefined) {
            const title = input.title.trim().slice(0, TITLE_MAX);
            if (!title) return { success: false, message: 'The title cannot be empty' };
            patch.title = title;
        }
        if (input.body !== undefined) patch.body = input.body.slice(0, BODY_MAX);

        const { error } = await supabase.from('linkedin_ideas').update(patch).eq('id', id).eq('user_id', user.id);
        if (error) throw error;

        revalidatePath(IDEAS_PATH);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'Could not save that idea');
    }
}

// One atomic update for a drag-and-drop move, whether it's a reorder within a column or a move
// between columns. posted_at is computed client-side (lib/linkedin-ideas/board.ts's
// computePostedAt) from the card's previous status, which the client already has in its own
// state right before the move -- trusted as given, since it's the user's own data with no
// security implication.
export async function moveIdea(
    id: string,
    input: { status: IdeaStatus; position: number; posted_at: string | null }
): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { error } = await supabase
            .from('linkedin_ideas')
            .update({
                status: input.status,
                position: input.position,
                posted_at: input.posted_at,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('user_id', user.id);
        if (error) throw error;

        revalidatePath(IDEAS_PATH);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'Could not move that card');
    }
}

export async function deleteIdea(id: string): Promise<ActionResult<null>> {
    try {
        const { supabase, user } = await requireUser();

        const { error } = await supabase.from('linkedin_ideas').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;

        revalidatePath(IDEAS_PATH);
        return { success: true, data: null };
    } catch (error) {
        return failure(error, 'Could not delete that idea');
    }
}
