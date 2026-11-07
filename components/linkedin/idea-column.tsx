'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Idea, IdeaStatus } from '@/lib/types/linkedin-ideas'
import { IdeaCard } from './idea-card'

export const COLUMN_LABELS: Record<IdeaStatus, string> = { idea: 'Idea', draft: 'Draft', posted: 'Posted' }

interface IdeaColumnProps {
    status: IdeaStatus
    ideas: Idea[]
    onCardClick: (id: string) => void
}

// The column's own id (its status) doubles as a droppable target, so a card can be dropped into
// an empty column or into the empty space below the last card -- dnd-kit resolves `over` to this
// when the pointer isn't over any individual card.
export function IdeaColumn({ status, ideas, onCardClick }: IdeaColumnProps) {
    const { setNodeRef } = useDroppable({ id: status })

    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-foreground">{COLUMN_LABELS[status]}</h3>
                <span className="text-xs text-muted-foreground">{ideas.length}</span>
            </div>
            <SortableContext items={ideas.map((idea) => idea.id)} strategy={verticalListSortingStrategy}>
                <div
                    ref={setNodeRef}
                    className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-dashed bg-muted/30 p-2"
                >
                    {ideas.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Drop a card here</p>}
                    {ideas.map((idea) => (
                        <IdeaCard key={idea.id} idea={idea} onClick={() => onCardClick(idea.id)} />
                    ))}
                </div>
            </SortableContext>
        </div>
    )
}
