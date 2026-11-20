import { describe, expect, it } from 'vitest'
import type { DeckSummary } from '@/features/package/package'
import { buildDeckTree, type DeckNode } from './deck-tree'

const deck = (name: string, cardCount: number, notes: [number, number][] = [], filtered = false): DeckSummary => ({
  id: name.length,
  name,
  filtered,
  cardCount,
  notesByType: notes.map(([noteTypeId, count]) => ({ noteTypeId, count })),
})

/** name: cards → note type, with children indented. */
function outline(nodes: DeckNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    `${'  '.repeat(depth)}${node.label}: ${String(node.cardCount)} → ${String(node.noteTypeId)}${node.filtered ? ' (filtered)' : ''}`,
    ...outline(node.children, depth + 1),
  ])
}

describe('buildDeckTree', () => {
  it('nests decks by name, adding the ones above, and totals cards and notes', () => {
    const tree = buildDeckTree([
      deck('Lang::German', 10, [[2, 5]]),
      deck('Lang::French', 6, [[1, 2], [2, 1]]),
      deck('Lang::French::Verbs', 4, [[1, 4]]),
      deck('Lang::Cram', 3, [], true),
      deck('Maths', 1, [[3, 1]]),
    ])
    expect(outline(tree)).toEqual([
      // Lang holds no cards itself; note type 1 has 6 notes below it, type 2 has 6 too: the older wins.
      'Lang: 20 → 1',
      '  Cram: 3 → null (filtered)',
      '  French: 10 → 1',
      '    Verbs: 4 → 1',
      '  German: 10 → 2',
      'Maths: 1 → 3',
    ])
    expect(tree[0]?.children[1]?.name).toBe('Lang::French')
  })
})
