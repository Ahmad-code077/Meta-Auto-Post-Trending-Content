export type IdeaStatus = 'idea' | 'draft' | 'posted'

export interface Idea {
    id: string
    user_id: string
    title: string
    body: string
    status: IdeaStatus
    position: number
    posted_at: string | null
    created_at: string
    updated_at: string
}
