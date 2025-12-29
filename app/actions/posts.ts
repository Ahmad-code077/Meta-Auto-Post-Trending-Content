'use server'

import { createClient } from '@/lib/supabase/server'
import { Post } from '@/lib/types/posts'
import { revalidatePath } from 'next/cache'

export async function approvePost(postId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('posts')
        .update({
            status: 'approved',
            updated_at: new Date().toISOString()
        })
        .eq('id', postId)

    if (error) {
        console.error('Error approving post:', error)
        throw new Error('Failed to approve post')
    }

    revalidatePath('/dashboard')
}

export async function rejectPost(postId: string, reason?: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('posts')
        .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
        })
        .eq('id', postId)

    if (error) {
        console.error('Error rejecting post:', error)
        throw new Error('Failed to reject post')
    }

    revalidatePath('/dashboard')
}

export async function updatePost(postId: string, data: Partial<Post>) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('posts')
        .update({
            ...data,
            updated_at: new Date().toISOString()
        })
        .eq('id', postId)

    if (error) {
        console.error('Error updating post:', error)
        throw new Error('Failed to update post')
    }

    revalidatePath('/dashboard')
}