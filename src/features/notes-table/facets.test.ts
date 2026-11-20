import { describe, expect, it } from 'vitest'
import type { NoteRow } from '@/features/package/note-row'
import { computeFacets } from './facets'

const row = (id: number, decks: string[], tags: string[] = []): NoteRow => ({
  id,
  fields: [],
  media: {},
  tags,
  decks,
  cardCount: 1,
  created: id,
  modified: id,
  search: '',
})

describe('computeFacets', () => {
  it('counts each note once per deck, including the decks above its own', () => {
    const facets = computeFacets([
      row(1, ['Lang::French', 'Lang::German']),
      row(2, ['Lang::German::Verbs'], ['verbs']),
      row(3, ['Maths']),
    ])
    expect(facets.decks).toEqual([
      { value: 'Lang', count: 2 },
      { value: 'Lang::French', count: 1 },
      { value: 'Lang::German', count: 2 },
      { value: 'Lang::German::Verbs', count: 1 },
      { value: 'Maths', count: 1 },
    ])
    expect(facets).toMatchObject({ tags: [{ value: 'verbs', count: 1 }], untaggedCount: 2 })
  })
})
