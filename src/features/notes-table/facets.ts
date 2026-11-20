import type { NoteRow } from '@/features/package/note-row'
import { compareText } from '@/lib/format'
import type { Facet, Facets } from './column-filter'

function toFacets(counts: Map<string, number>): Facet[] {
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => compareText(a.value, b.value))
}

/** Every tag and deck used by these notes, with how many notes use each. */
export function computeFacets(rows: NoteRow[]): Facets {
  const tags = new Map<string, number>()
  const decks = new Map<string, number>()
  let untaggedCount = 0
  for (const row of rows) {
    if (row.tags.length === 0) untaggedCount++
    for (const tag of row.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1)
    for (const deck of row.decks) decks.set(deck, (decks.get(deck) ?? 0) + 1)
  }
  return { tags: toFacets(tags), decks: toFacets(decks), untaggedCount }
}
