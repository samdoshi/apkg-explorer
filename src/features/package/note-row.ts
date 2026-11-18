import type { MediaRef } from './html-text'

/** One note as the table sees it. Built in the worker; plain data only. */
export interface NoteRow {
  id: number
  /** Plain text of each field, in field order. */
  fields: string[]
  /** Media referenced by each field, keyed by field index (only fields that have any). */
  media: Record<number, MediaRef[]>
  tags: string[]
  /** Names of the decks this note's cards are in. */
  decks: string[]
  cardCount: number
  /** Creation time (ms since epoch); Anki note ids are creation timestamps. */
  created: number
  /** Last modified time (ms since epoch). */
  modified: number
  /** Fields, tags and decks, normalised for search (see lib/search). */
  search: string
}
