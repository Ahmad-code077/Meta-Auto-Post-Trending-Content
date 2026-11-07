'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { moveIdea } from '@/app/actions/linkedin-ideas'
import { countsByStatus, ideasByStatus, moveCardInState } from '@/lib/linkedin-ideas/board'
import type { Idea, IdeaStatus } from '@/lib/types/linkedin-ideas'
import { BulkAddIdeas } from './bulk-add-ideas'
import { IdeaCard } from './idea-card'
import { IdeaColumn } from './idea-column'
import { IdeaEditDialog } from './idea-edit-dialog'

const STATUSES: IdeaStatus[] = ['idea', 'draft', 'posted']

interface IdeaBoardProps {
    initialIdeas: Idea[]
}

function resolveDestination(overId: string, ideas: Idea[]): { status: IdeaStatus; index: number } | null {
    if ((STATUSES as string[]).includes(overId)) {
        const status = overId as IdeaStatus
        return { status, index: ideasByStatus(ideas, status).length }
    }
    const overCard = ideas.find((idea) => idea.id === overId)
    if (!overCard) return null
    const column = ideasByStatus(ideas, overCard.status)
    const index = column.findIndex((idea) => idea.id === overId)
    return { status: overCard.status, index: index === -1 ? column.length : index }
}

export function IdeaBoard({ initialIdeas }: IdeaBoardProps) {
    const router = useRouter()
    const { toast } = useToast()
    const [ideas, setIdeas] = useState(initialIdeas)
    // Tracks the last initialIdeas seen, so a prop change (router.refresh() after bulk-add) can
    // be adopted during render -- React's documented way to reset state from a changed prop
    // without an effect. Drags and edits update `ideas` directly and never touch this, so a drag
    // in progress can't be clobbered by it.
    const [syncedIdeas, setSyncedIdeas] = useState(initialIdeas)
    if (initialIdeas !== syncedIdeas) {
        setSyncedIdeas(initialIdeas)
        setIdeas(initialIdeas)
    }
    const [activeId, setActiveId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const dragSnapshotRef = useRef<Idea[] | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragStart = (event: DragStartEvent) => {
        dragSnapshotRef.current = ideas
        setActiveId(String(event.active.id))
    }

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        if (!over) return
        const destination = resolveDestination(String(over.id), ideas)
        if (!destination) return
        setIdeas((prev) => moveCardInState(prev, { id: String(active.id), toStatus: destination.status, toIndex: destination.index }))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        const snapshot = dragSnapshotRef.current
        dragSnapshotRef.current = null

        if (!over) {
            if (snapshot) setIdeas(snapshot)
            return
        }

        const destination = resolveDestination(String(over.id), ideas)
        if (!destination) return

        const next = moveCardInState(ideas, { id: String(active.id), toStatus: destination.status, toIndex: destination.index })
        setIdeas(next)

        const moved = next.find((idea) => idea.id === active.id)
        if (!moved) return

        moveIdea(moved.id, { status: moved.status, position: moved.position, posted_at: moved.posted_at }).then((result) => {
            if (!result.success) {
                toast({ title: 'Could not move that card', description: result.message, variant: 'destructive' })
                if (snapshot) setIdeas(snapshot)
            }
        })
    }

    const counts = countsByStatus(ideas)
    const activeIdea = activeId ? ideas.find((idea) => idea.id === activeId) ?? null : null
    const editingIdea = editingId ? ideas.find((idea) => idea.id === editingId) ?? null : null

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                    <Badge variant="secondary">{counts.idea} idea{counts.idea === 1 ? '' : 's'}</Badge>
                    <Badge variant="secondary">{counts.draft} draft{counts.draft === 1 ? '' : 's'}</Badge>
                    <Badge variant="secondary">{counts.posted} posted</Badge>
                </div>
                {ideas.length > 0 && <BulkAddIdeas variant="button" onAdded={() => router.refresh()} />}
            </div>

            {ideas.length === 0 ? (
                <BulkAddIdeas variant="empty-state" onAdded={() => router.refresh()} />
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 sm:[&>*]:snap-none">
                        {STATUSES.map((status) => (
                            <div key={status} className="w-[88vw] max-w-sm shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink">
                                <IdeaColumn status={status} ideas={ideasByStatus(ideas, status)} onCardClick={setEditingId} />
                            </div>
                        ))}
                    </div>
                    <DragOverlay>
                        {activeIdea && (
                            <div className="w-[88vw] max-w-sm sm:max-w-xs">
                                <IdeaCard idea={activeIdea} onClick={() => {}} />
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>
            )}

            <IdeaEditDialog
                idea={editingIdea}
                onOpenChange={(open) => !open && setEditingId(null)}
                onSaved={(id, patch) => setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, ...patch } : idea)))}
                onDeleted={(id) => setIdeas((prev) => prev.filter((idea) => idea.id !== id))}
            />
        </div>
    )
}
