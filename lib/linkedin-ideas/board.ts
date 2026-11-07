import type { Idea, IdeaStatus } from '@/lib/types/linkedin-ideas'
import { positionBetween } from './position'

export function countsByStatus(ideas: Idea[]): Record<IdeaStatus, number> {
    const counts: Record<IdeaStatus, number> = { idea: 0, draft: 0, posted: 0 }
    for (const idea of ideas) counts[idea.status]++
    return counts
}

export function ideasByStatus(ideas: Idea[], status: IdeaStatus): Idea[] {
    return ideas.filter((idea) => idea.status === status).sort((a, b) => a.position - b.position)
}

// Stamps posted_at only on the transition into "posted", and clears it only on the transition out
// of it. Reordering within -- or editing -- a card that is already (or still not) posted must
// never touch this field.
export function computePostedAt(
    previousStatus: IdeaStatus,
    nextStatus: IdeaStatus,
    previousPostedAt: string | null
): string | null {
    if (nextStatus === 'posted' && previousStatus !== 'posted') return new Date().toISOString()
    if (nextStatus !== 'posted' && previousStatus === 'posted') return null
    return previousPostedAt
}

export interface MoveCardInput {
    id: string
    toStatus: IdeaStatus
    // Index within the destination column's cards, excluding the card being moved.
    toIndex: number
}

// The single state transform behind both the live drag-over preview and the final drop -- same
// function for both, so they can never disagree about where a card ends up.
export function moveCardInState(ideas: Idea[], { id, toStatus, toIndex }: MoveCardInput): Idea[] {
    const card = ideas.find((idea) => idea.id === id)
    if (!card) return ideas

    const destination = ideasByStatus(ideas, toStatus).filter((idea) => idea.id !== id)
    const clampedIndex = Math.max(0, Math.min(toIndex, destination.length))
    const before = clampedIndex > 0 ? destination[clampedIndex - 1] : null
    const after = clampedIndex < destination.length ? destination[clampedIndex] : null

    const updated: Idea = {
        ...card,
        status: toStatus,
        position: positionBetween(before?.position ?? null, after?.position ?? null),
        posted_at: computePostedAt(card.status, toStatus, card.posted_at),
    }

    return ideas.map((idea) => (idea.id === id ? updated : idea))
}
