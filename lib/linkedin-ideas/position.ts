// Drag-reorder position, Trello-style: a card's position is the midpoint between its neighbors,
// so moving one card is a single-row update -- no renumbering the rest of the column.
export function positionBetween(before: number | null, after: number | null): number {
    if (before === null && after === null) return 0
    if (before === null) return after! - 1
    if (after === null) return before + 1
    return (before + after) / 2
}
