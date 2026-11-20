import { describe, expect, it } from 'vitest'
import type { NoteRow } from '@/features/package/note-row'
import { normalizeForSearch } from '@/lib/search'
import { describeFilter, fieldColumnId, filterRows, isFilterActive, type ColumnFilters } from './filters'

function note(id: number, fields: string[], extra: Partial<NoteRow> = {}): NoteRow {
  const row: NoteRow = {
    id,
    fields,
    media: {},
    tags: [],
    decks: ['Default'],
    cardCount: 1,
    created: new Date(`2024-03-0${id}T12:00:00`).getTime(),
    modified: new Date(`2024-04-0${id}T12:00:00`).getTime(),
    search: '',
    ...extra,
  }
  row.search = normalizeForSearch([...row.fields, ...row.tags, ...row.decks].join('\n'))
  return row
}

const rows = [
  note(1, ['France', 'Paris'], { tags: ['europe', 'geography'], decks: ['Geo'], cardCount: 2 }),
  note(2, ['Japan', 'Tokyo'], { tags: ['asia', 'geography'], decks: ['Geo'], cardCount: 2 }),
  note(3, ['Österreich', 'Wien'], { tags: ['europe'], decks: ['Deutsch'] }),
  note(4, ['Empty', ''], { media: { 1: [{ kind: 'image', name: 'map.png' }] } }),
  note(5, ['Blank', '']),
]
const ids = (filtered: NoteRow[]) => filtered.map((row) => row.id)

describe('filterRows', () => {
  it('returns every row when nothing is filtered', () => {
    expect(filterRows(rows, '  ', {})).toBe(rows)
  })

  it('global search needs every word, ignoring case and accents', () => {
    expect(ids(filterRows(rows, 'osterreich', {}))).toEqual([3])
    expect(ids(filterRows(rows, 'GEO tokyo', {}))).toEqual([2])
    expect(ids(filterRows(rows, 'paris tokyo', {}))).toEqual([])
  })

  it('text filters: contains, empty and not empty (media counts as content)', () => {
    expect(ids(filterRows(rows, '', { 'field:1': { kind: 'text', op: 'contains', value: 'I' } }))).toEqual([1, 3])
    expect(ids(filterRows(rows, '', { 'field:1': { kind: 'text', op: 'contains', value: 'map' } }))).toEqual([4])
    expect(ids(filterRows(rows, '', { 'field:1': { kind: 'text', op: 'empty' } }))).toEqual([5])
    expect(ids(filterRows(rows, '', { 'field:1': { kind: 'text', op: 'not-empty' } }))).toEqual([1, 2, 3, 4])
  })

  it('text filters ignore accents, and give the same answers each time (fields are normalised once)', () => {
    const contains = (index: number, value: string) => {
      const filters: ColumnFilters = {}
      filters[fieldColumnId(index)] = { kind: 'text', op: 'contains', value }
      return ids(filterRows(rows, '', filters))
    }
    expect(contains(0, 'OSTER')).toEqual([3])
    expect(contains(0, 'oster')).toEqual([3])
    // Each field of a row is normalised separately.
    expect(contains(1, 'wien')).toEqual([3])
    expect(contains(0, 'wien')).toEqual([])
  })

  it('tag filters match any, all, or untagged', () => {
    const any: ColumnFilters = { tags: { kind: 'tags', tags: ['asia', 'europe'], match: 'any', untagged: false } }
    expect(ids(filterRows(rows, '', any))).toEqual([1, 2, 3])
    const all: ColumnFilters = { tags: { kind: 'tags', tags: ['europe', 'geography'], match: 'all', untagged: false } }
    expect(ids(filterRows(rows, '', all))).toEqual([1])
    const untagged: ColumnFilters = { tags: { kind: 'tags', tags: ['asia'], match: 'any', untagged: true } }
    expect(ids(filterRows(rows, '', untagged))).toEqual([2, 4, 5])
  })

  it('deck, card count and date filters', () => {
    expect(ids(filterRows(rows, '', { decks: { kind: 'decks', decks: ['Deutsch', 'Geo'] } }))).toEqual([1, 2, 3])
    expect(ids(filterRows(rows, '', { cards: { kind: 'range', min: 2, max: null } }))).toEqual([1, 2])
    expect(ids(filterRows(rows, '', { created: { kind: 'date', from: '2024-03-02', to: '2024-03-03' } }))).toEqual([2, 3])
    expect(ids(filterRows(rows, '', { modified: { kind: 'date', from: '', to: '2024-04-01' } }))).toEqual([1])
  })

  it('combines filters and search', () => {
    const filters: ColumnFilters = {
      decks: { kind: 'decks', decks: ['Geo'] },
      'field:0': { kind: 'text', op: 'contains', value: 'an' },
    }
    expect(ids(filterRows(rows, 'tokyo', filters))).toEqual([2])
  })

  it('ignores inactive filters', () => {
    const filters: ColumnFilters = {
      'field:0': { kind: 'text', op: 'contains', value: ' ' },
      tags: { kind: 'tags', tags: [], match: 'any', untagged: false },
    }
    expect(filterRows(rows, '', filters)).toBe(rows)
    expect(isFilterActive({ kind: 'range', min: null, max: 3 })).toBe(true)
  })
})

describe('describeFilter', () => {
  it('summarises each kind of filter', () => {
    expect(describeFilter('Capital', { kind: 'text', op: 'contains', value: ' ber ' })).toBe('Capital contains “ber”')
    expect(describeFilter('Tags', { kind: 'tags', tags: ['a', 'b'], match: 'all', untagged: false })).toBe('Tags: a and b')
    expect(describeFilter('Tags', { kind: 'tags', tags: ['a'], match: 'any', untagged: true })).toBe('Tags: a or untagged')
    expect(describeFilter('Cards', { kind: 'range', min: 2, max: null })).toBe('Cards ≥ 2')
    expect(describeFilter('Created', { kind: 'date', from: '', to: '2024-01-31' })).toBe('Created until 2024-01-31')
  })
})
