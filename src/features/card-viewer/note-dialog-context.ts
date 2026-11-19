import type { NoteRow } from '@/features/package/note-row'
import type { NoteTypeSummary } from '@/features/package/package'

/** What the notes table passes to the note popup through its <Outlet>. */
export interface NoteDialogContext {
  noteType: NoteTypeSummary
  /** Note ids in the table's current order, after search and filters. */
  orderedIds: readonly number[]
  /** The table's (plain text) row for a note of this note type. */
  rowFor: (noteId: number) => NoteRow | undefined
  /** Called as the popup closes, with the note it was showing. */
  onClosed: (noteId: number) => void
}

/** Location state for a popup opened from the table, so closing can go Back. */
export interface NoteDialogLocationState {
  fromTable: true
}

export function isFromTable(state: unknown): state is NoteDialogLocationState {
  return typeof state === 'object' && state !== null && 'fromTable' in state && state.fromTable === true
}
