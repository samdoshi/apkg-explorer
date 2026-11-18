import type { NoteRow } from '@/features/package/note-row'
import { normalizeForSearch, searchWords } from '@/lib/search'

/** Column ids: one per field ("field:0", "field:1", …) plus the fixed columns. */
export type FixedColumnId = 'tags' | 'decks' | 'cards' | 'created' | 'modified'
export type ColumnId = `field:${number}` | FixedColumnId

export const fieldColumnId = (index: number): ColumnId => `field:${index}`

export function fieldIndexOf(columnId: string): number | null {
  const match = /^field:(\d+)$/.exec(columnId)
  return match ? Number(match[1]) : null
}

export type TextFilter =
  | { kind: 'text'; op: 'contains'; value: string }
  | { kind: 'text'; op: 'empty' }
  | { kind: 'text'; op: 'not-empty' }
export interface TagsFilter {
  kind: 'tags'
  tags: string[]
  match: 'any' | 'all'
  untagged: boolean
}
export interface DecksFilter {
  kind: 'decks'
  decks: string[]
}
export interface RangeFilter {
  kind: 'range'
  min: number | null
  max: number | null
}
/** Dates as yyyy-mm-dd strings (what <input type="date"> uses), in local time. */
export interface DateFilter {
  kind: 'date'
  from: string
  to: string
}

export type ColumnFilter = TextFilter | TagsFilter | DecksFilter | RangeFilter | DateFilter
export type ColumnFilters = Partial<Record<ColumnId, ColumnFilter>>

/** False for filters that wouldn't exclude anything (e.g. an empty "contains"). */
export function isFilterActive(filter: ColumnFilter): boolean {
  switch (filter.kind) {
    case 'text':
      return filter.op !== 'contains' || filter.value.trim() !== ''
    case 'tags':
      return filter.tags.length > 0 || filter.untagged
    case 'decks':
      return filter.decks.length > 0
    case 'range':
      return filter.min !== null || filter.max !== null
    case 'date':
      return filter.from !== '' || filter.to !== ''
  }
}

/** The searchable text of a field: its text, or its media file names if it has no text. */
export function fieldValue(row: NoteRow, index: number): string {
  const text = row.fields[index] ?? ''
  if (text) return text
  return (row.media[index] ?? []).map((ref) => ref.name).join(' ')
}

function startOfDay(date: string): number {
  return new Date(`${date}T00:00:00`).getTime()
}

/** Builds a predicate once per filter change, so per-row checks stay cheap. */
function compile(columnId: ColumnId, filter: ColumnFilter): (row: NoteRow) => boolean {
  switch (filter.kind) {
    case 'text': {
      const index = fieldIndexOf(columnId) ?? -1
      if (filter.op === 'empty') return (row) => fieldValue(row, index) === ''
      if (filter.op === 'not-empty') return (row) => fieldValue(row, index) !== ''
      const words = searchWords(filter.value)
      return (row) => {
        const text = normalizeForSearch(fieldValue(row, index))
        return words.every((word) => text.includes(word))
      }
    }
    case 'tags': {
      const wanted = new Set(filter.tags)
      return (row) => {
        if (row.tags.length === 0) return filter.untagged
        if (wanted.size === 0) return false
        const has = (tag: string) => row.tags.includes(tag)
        return filter.match === 'all' ? [...wanted].every(has) : [...wanted].some(has)
      }
    }
    case 'decks': {
      const wanted = new Set(filter.decks)
      return (row) => row.decks.some((deck) => wanted.has(deck))
    }
    case 'range': {
      const { min, max } = filter
      return (row) => (min === null || row.cardCount >= min) && (max === null || row.cardCount <= max)
    }
    case 'date': {
      const from = filter.from ? startOfDay(filter.from) : -Infinity
      // "to" includes the whole day.
      const to = filter.to ? startOfDay(filter.to) + 86_400_000 : Infinity
      const key = columnId === 'created' ? 'created' : 'modified'
      return (row) => row[key] >= from && row[key] < to
    }
  }
}

/**
 * Applies the global search (every word must appear somewhere in the note) and
 * every active column filter.
 */
export function filterRows(rows: NoteRow[], query: string, filters: ColumnFilters): NoteRow[] {
  const words = searchWords(query)
  const checks = Object.entries(filters).flatMap(([columnId, filter]) =>
    filter && isFilterActive(filter) ? [compile(columnId as ColumnId, filter)] : [],
  )
  if (words.length === 0 && checks.length === 0) return rows
  return rows.filter(
    (row) => words.every((word) => row.search.includes(word)) && checks.every((check) => check(row)),
  )
}

/** Short description for the active-filter chips, e.g. 'Capital contains "ber"'. */
export function describeFilter(label: string, filter: ColumnFilter): string {
  switch (filter.kind) {
    case 'text':
      if (filter.op === 'empty') return `${label} is empty`
      if (filter.op === 'not-empty') return `${label} is not empty`
      return `${label} contains “${filter.value.trim()}”`
    case 'tags': {
      const parts = [...filter.tags]
      if (filter.untagged) parts.push('untagged')
      const joiner = filter.match === 'all' && filter.tags.length > 1 ? ' and ' : ' or '
      return `${label}: ${parts.join(joiner)}`
    }
    case 'decks':
      return `${label}: ${filter.decks.join(' or ')}`
    case 'range':
      if (filter.min !== null && filter.max !== null) return `${label} ${filter.min}–${filter.max}`
      return filter.min !== null ? `${label} ≥ ${filter.min}` : `${label} ≤ ${filter.max ?? ''}`
    case 'date':
      if (filter.from && filter.to) return `${label} ${filter.from} to ${filter.to}`
      return filter.from ? `${label} from ${filter.from}` : `${label} until ${filter.to}`
  }
}
