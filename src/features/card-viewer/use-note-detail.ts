import { useEffect, useState } from 'react'
import type { NoteTypeInfo } from '@/features/package/collection'
import { toPackageError } from '@/features/package/errors'
import type { NoteDetail } from '@/features/package/note-detail'
import type { PackageClient } from '@/features/package/package-client'

export type NoteDetailState =
  | { status: 'loading' }
  | { status: 'ready'; note: NoteDetail; noteType: NoteTypeInfo }
  | { status: 'missing' }
  | { status: 'failed'; message: string }

/**
 * Loads a note and its note type from the worker. The calling component is keyed by
 * note, so it starts in the loading state for each one.
 */
export function useNoteDetail(client: PackageClient, noteId: number, noteTypeId: number): NoteDetailState {
  const [state, setState] = useState<NoteDetailState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    Promise.all([client.getNote(noteId), client.getNoteType(noteTypeId)]).then(
      ([note, noteType]) => {
        if (cancelled) return
        setState(
          note && noteType && note.noteTypeId === noteTypeId
            ? { status: 'ready', note, noteType }
            : { status: 'missing' },
        )
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: toPackageError(error).message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, noteId, noteTypeId])
  return state
}
