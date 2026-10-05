import { createClient } from '@/lib/supabase/server'
import { Post, PostsResponse, Filters, PostStatus } from '@/lib/types/posts'

const RETENTION_MS = 24 * 60 * 60 * 1000

// Count of posts that deleteOldPosts would remove.
export async function getDeletablePostsCount(): Promise<number> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()
    const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lt('created_at', cutoff)
        .neq('status', 'published')

    if (error) {
        console.error('Error counting deletable posts:', error)
        return 0
    }

    return count ?? 0
}

export async function getPosts(filters: Filters = {}): Promise<PostsResponse> {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
        console.error('Authentication error:', authError)
        throw new Error('Unauthorized: Please log in to view posts')
    }
    let query = supabase
        .from('posts')
        .select('*', { count: 'exact' })

    // Apply filters
    if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as PostStatus)
    }

    if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`)
    }

    if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
    }

    if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo)
    }
    query = query.eq('user_id', user.id)

    // Pagination
    const page = filters.page || 1
    const pageSize = filters.pageSize || 10
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    query = query.order('created_at', { ascending: false })
        .range(from, to)

    const { data, error, count } = await query

    if (error) {
        console.error('Error fetching posts:', error)
        throw new Error('Failed to fetch posts')
    }

    const total = count || 0
    const totalPages = Math.ceil(total / pageSize)

    return {
        posts: data as Post[],
        meta: {
            total,
            page,
            pageSize,
            totalPages
        }
    }
}