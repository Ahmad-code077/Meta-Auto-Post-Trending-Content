'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types/actions'
import type { Platform } from '@/lib/types/posts'

const PLATFORMS: Platform[] = ['instagram', 'facebook']
const RETENTION_MS = 24 * 60 * 60 * 1000

async function callWebhook(url: string | undefined, body: unknown): Promise<void> {
    if (!url) {
        throw new Error('Webhook URL is not configured')
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.N8N_WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`)
    }
}

export async function requestImageGeneration(postId: string): Promise<ActionResult> {
    try {
        const { supabase, user } = await requireUser()

        const { data: post, error } = await supabase
            .from('posts')
            .select('id, status')
            .eq('id', postId)
            .eq('user_id', user.id)
            .single()

        if (error || !post) {
            return { success: false, message: 'Post not found' }
        }

        if (post.status !== 'pending') {
            return { success: false, message: 'Only pending posts can get a generated image' }
        }

        await callWebhook(process.env.NEXT_PUBLIC_N8N_GENERATE_IMAGE_WEBHOOK_URL, {
            postId,
            action: 'generate_image',
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('requestImageGeneration failed:', error)
        return { success: false, message: 'Image generation request failed' }
    }
}

export async function requestPublish(postId: string, platforms: Platform[]): Promise<ActionResult> {
    try {
        const selected = platforms.filter((p): p is Platform => PLATFORMS.includes(p))
        if (selected.length === 0) {
            return { success: false, message: 'Select at least one platform' }
        }

        const { supabase, user } = await requireUser()

        const { data: post, error } = await supabase
            .from('posts')
            .select('id, status, image_url')
            .eq('id', postId)
            .eq('user_id', user.id)
            .single()

        if (error || !post) {
            return { success: false, message: 'Post not found' }
        }

        if (post.status !== 'approved' || !post.image_url) {
            return { success: false, message: 'Only approved posts with an image can be published' }
        }

        await callWebhook(process.env.NEXT_PUBLIC_N8N_PUBLISH_POST_WEBHOOK_URL, {
            postId,
            action: 'publish',
            platforms: selected,
        })

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error('requestPublish failed:', error)
        return { success: false, message: 'Publish request failed' }
    }
}

export async function approvePost(postId: string): Promise<ActionResult> {
    return setModerationStatus(postId, 'approved')
}

export async function rejectPost(postId: string): Promise<ActionResult> {
    return setModerationStatus(postId, 'rejected')
}

async function setModerationStatus(postId: string, status: 'approved' | 'rejected'): Promise<ActionResult> {
    try {
        const { supabase, user } = await requireUser()

        const { error } = await supabase
            .from('posts')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', postId)
            .eq('user_id', user.id)

        if (error) throw error

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error) {
        console.error(`Failed to set post ${postId} to ${status}:`, error)
        return { success: false, message: `Could not mark post as ${status}` }
    }
}

// Deletes posts older than 24 hours that were never published.
export async function deleteOldPosts(): Promise<ActionResult<number>> {
    try {
        const { supabase, user } = await requireUser()
        const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

        const { error, count } = await supabase
            .from('posts')
            .delete({ count: 'exact' })
            .eq('user_id', user.id)
            .lt('created_at', cutoff)
            .neq('status', 'published')

        if (error) throw error

        revalidatePath('/dashboard')
        return { success: true, data: count ?? 0 }
    } catch (error) {
        console.error('deleteOldPosts failed:', error)
        return { success: false, message: 'Failed to delete old posts' }
    }
}
