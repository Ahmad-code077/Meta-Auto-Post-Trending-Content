import { createClient } from '@/lib/supabase/server'
import { Post, PostsResponse, Filters, PostStatus } from '@/lib/types/posts'

export async function getPosts(filters: Filters = {}): Promise<PostsResponse> {
    const supabase = await createClient()

    console.log('trigger on filter change ? ')
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