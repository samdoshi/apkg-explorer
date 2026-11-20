import type { DeckSummary } from '@/features/package/package'
import { compareText } from '@/lib/format'

export interface DeckNode {
  /** The last part of the name: "Geography" for "Sample::Geography". */
  label: string
  name: string
  filtered: boolean
  /** Cards in the deck and its subdecks; for a filtered deck, the cards in it. */
  cardCount: number
  /** The note type with the most notes here, subdecks included (for the deck's link); null if none. */
  noteTypeId: number | null
  children: DeckNode[]
}

interface Draft {
  label: string
  name: string
  filtered: boolean
  cards: number
  notes: Map<number, number>
  children: Draft[]
}

/**
 * The decks as a tree, from their "::" names. Decks above the ones with cards are added
 * (Anki has them too; they just hold no cards themselves). A filtered deck's cards also
 * count in their home decks, so they aren't added to the decks above it.
 */
export function buildDeckTree(decks: readonly DeckSummary[]): DeckNode[] {
  const roots: Draft[] = []
  const drafts = new Map<string, Draft>()
  const draftFor = (name: string): Draft => {
    const existing = drafts.get(name)
    if (existing) return existing
    const parts = name.split('::')
    const draft: Draft = { label: parts.at(-1) ?? name, name, filtered: false, cards: 0, notes: new Map(), children: [] }
    drafts.set(name, draft)
    if (parts.length > 1) draftFor(parts.slice(0, -1).join('::')).children.push(draft)
    else roots.push(draft)
    return draft
  }
  for (const deck of decks) {
    const draft = draftFor(deck.name)
    draft.filtered = deck.filtered
    draft.cards = deck.cardCount
    for (const { noteTypeId, count } of deck.notesByType) draft.notes.set(noteTypeId, count)
  }

  const finish = (draft: Draft): { node: DeckNode; notes: Map<number, number> } => {
    const finished = draft.children.toSorted((a, b) => compareText(a.label, b.label)).map(finish)
    const notes = new Map(draft.notes)
    let cardCount = draft.cards
    for (const child of finished) {
      if (child.node.filtered) continue
      cardCount += child.node.cardCount
      for (const [noteTypeId, count] of child.notes) notes.set(noteTypeId, (notes.get(noteTypeId) ?? 0) + count)
    }
    // Most notes first; ties go to the older note type, so the choice is stable.
    const [best] = [...notes].sort(([idA, a], [idB, b]) => b - a || idA - idB)
    return {
      node: {
        label: draft.label,
        name: draft.name,
        filtered: draft.filtered,
        cardCount,
        noteTypeId: best?.[0] ?? null,
        children: finished.map((child) => child.node),
      },
      notes,
    }
  }
  return roots.toSorted((a, b) => compareText(a.label, b.label)).map((root) => finish(root).node)
}
