import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIdeaLines } from '../lib/linkedin-ideas/parse'
import { positionBetween } from '../lib/linkedin-ideas/position'
import { computePostedAt, countsByStatus, ideasByStatus, moveCardInState } from '../lib/linkedin-ideas/board'
import type { Idea, IdeaStatus } from '../lib/types/linkedin-ideas'

function idea(overrides: Partial<Idea> = {}): Idea {
    return {
        id: 'idea-1',
        user_id: 'user-1',
        title: 'Untitled',
        body: '',
        status: 'idea',
        position: 0,
        posted_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    }
}

test('parseIdeaLines splits one idea per line, trims, and drops blank lines', () => {
    assert.deepEqual(
        parseIdeaLines('First idea\n\n  Second idea  \nThird idea\n'),
        ['First idea', 'Second idea', 'Third idea']
    )
})

test('parseIdeaLines returns an empty array for blank input', () => {
    assert.deepEqual(parseIdeaLines('   \n\n  '), [])
})

test('positionBetween returns 0 for the first card in an empty column', () => {
    assert.equal(positionBetween(null, null), 0)
})

test('positionBetween returns one less than the only neighbor when dropped at the start', () => {
    assert.equal(positionBetween(null, 5), 4)
})

test('positionBetween returns one more than the only neighbor when dropped at the end', () => {
    assert.equal(positionBetween(5, null), 6)
})

test('positionBetween returns the midpoint between two neighbors', () => {
    assert.equal(positionBetween(2, 4), 3)
})

test('countsByStatus tallies each status independently', () => {
    const ideas = [idea({ status: 'idea' }), idea({ status: 'idea' }), idea({ status: 'draft' }), idea({ status: 'posted' })]
    assert.deepEqual(countsByStatus(ideas), { idea: 2, draft: 1, posted: 1 })
})

test('ideasByStatus filters to one status and sorts by position', () => {
    const ideas = [
        idea({ id: 'a', status: 'idea', position: 2 }),
        idea({ id: 'b', status: 'idea', position: 1 }),
        idea({ id: 'c', status: 'draft', position: 0 }),
    ]
    assert.deepEqual(ideasByStatus(ideas, 'idea').map((i) => i.id), ['b', 'a'])
})

test('computePostedAt stamps now() only on the transition into posted', () => {
    const before = computePostedAt('draft', 'posted', null)
    assert.ok(before !== null && !Number.isNaN(Date.parse(before)))
})

test('computePostedAt clears the timestamp on the transition out of posted', () => {
    assert.equal(computePostedAt('posted', 'draft', '2026-01-01T00:00:00.000Z'), null)
})

test('computePostedAt leaves the timestamp alone when reordering within posted', () => {
    assert.equal(computePostedAt('posted', 'posted', '2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z')
})

test('computePostedAt leaves null alone outside of posted', () => {
    assert.equal(computePostedAt('idea', 'draft', null), null)
})

test('moveCardInState reorders within the same column', () => {
    const ideas = [
        idea({ id: 'a', status: 'idea', position: 1 }),
        idea({ id: 'b', status: 'idea', position: 2 }),
        idea({ id: 'c', status: 'idea', position: 3 }),
    ]
    // Move "a" to between "b" and "c" (index 1 among the other two).
    const next = moveCardInState(ideas, { id: 'a', toStatus: 'idea', toIndex: 1 })
    const order = ideasByStatus(next, 'idea').map((i) => i.id)
    assert.deepEqual(order, ['b', 'a', 'c'])
})

test('moveCardInState moves a card into a different column and stamps posted_at', () => {
    const ideas = [idea({ id: 'a', status: 'draft', position: 1 }), idea({ id: 'b', status: 'posted', position: 5 })]
    const next = moveCardInState(ideas, { id: 'a', toStatus: 'posted', toIndex: 1 })
    const moved = next.find((i) => i.id === 'a')!
    assert.equal(moved.status, 'posted')
    assert.equal(moved.position, 6)
    assert.ok(moved.posted_at !== null)
})

test('moveCardInState drops a card into an empty column', () => {
    const ideas = [idea({ id: 'a', status: 'idea', position: 1 })]
    const next = moveCardInState(ideas, { id: 'a', toStatus: 'draft', toIndex: 0 })
    const moved = next.find((i) => i.id === 'a')!
    assert.equal(moved.status, 'draft')
    assert.equal(moved.position, 0)
})

test('moveCardInState is a no-op array when the card id does not exist', () => {
    const ideas = [idea({ id: 'a' })]
    assert.deepEqual(moveCardInState(ideas, { id: 'missing', toStatus: 'draft', toIndex: 0 }), ideas)
})

test('moveCardInState excludes the moving card from its own neighbor calculation', () => {
    // "a" is already in draft; moving it to index 0 of draft (its own column) must not use itself
    // as a neighbor, which would otherwise collapse the midpoint onto its own position.
    const ideas: Idea[] = [
        idea({ id: 'a', status: 'draft' as IdeaStatus, position: 1 }),
        idea({ id: 'b', status: 'draft' as IdeaStatus, position: 2 }),
    ]
    const next = moveCardInState(ideas, { id: 'a', toStatus: 'draft', toIndex: 1 })
    const moved = next.find((i) => i.id === 'a')!
    assert.equal(moved.position, 3)
})
