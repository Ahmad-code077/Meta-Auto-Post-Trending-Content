'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Idea } from '@/lib/types/linkedin-ideas'

interface IdeaCardProps {
    idea: Idea
    onClick: () => void
}

export function IdeaCard({ idea, onClick }: IdeaCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            className={cn(
                'cursor-grab touch-none select-none rounded-md border bg-card p-3 text-sm shadow-sm active:cursor-grabbing',
                isDragging && 'opacity-40'
            )}
        >
            <p className="line-clamp-2 font-medium text-foreground">{idea.title}</p>
            {idea.body.trim().length > 0 && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{idea.body}</p>
            )}
            {idea.posted_at && (
                <p className="mt-2 text-xs text-muted-foreground">Posted {format(new Date(idea.posted_at), 'MMM d')}</p>
            )}
        </div>
    )
}
