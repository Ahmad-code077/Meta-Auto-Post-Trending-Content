import { IdeaBoard } from '@/components/linkedin/idea-board'
import { requireUser } from '@/lib/supabase/server'
import type { Idea } from '@/lib/types/linkedin-ideas'

export default async function LinkedInIdeasPage() {
    const { supabase, user } = await requireUser()

    const { data, error } = await supabase
        .from('linkedin_ideas')
        .select('*')
        .eq('user_id', user.id)
        .order('status', { ascending: true })
        .order('position', { ascending: true })

    if (error) throw new Error('Could not load your ideas')

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">LinkedIn post ideas</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Paste ideas, drag them from Idea to Draft to Posted, and write the actual post when you get to it.
                </p>
            </div>
            <IdeaBoard initialIdeas={(data ?? []) as Idea[]} />
        </div>
    )
}
