export type PostStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface Post {
    id: string
    title: string
    content: string
    pub_date: string | null
    link: string | null
    image_url: string | null
    status: PostStatus
    created_at: string
    updated_at: string
    hashtags: string[] | null
    platforms?: Platform[]
}

export type Platform = 'instagram' | 'facebook'

export interface PaginationMeta {
    total: number
    page: number
    pageSize: number
    totalPages: number
}

export interface PostsResponse {
    posts: Post[]
    meta: PaginationMeta
}

export type FilterStatus = PostStatus | 'all'

export interface Filters {
    status?: FilterStatus
    search?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
}

export interface WebhookPayload {
    postId: string
    action: 'generate_image' | 'publish'
    platforms?: Platform[]
}