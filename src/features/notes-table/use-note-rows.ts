import { useEffect, useState } from 'react'
import { toPackageError } from '@/features/package/errors'
import type { NoteRow } from '@/features/package/note-row'
import type { PackageClient } from '@/features/package/package-client'

export type NoteRowsState =
  | { status: 'loading' }
  | { status: 'ready'; rows: NoteRow[] }
  | { status: 'failed'; message: string }

/**
 * Loads one note type's rows from the worker. The calling component is keyed by
 * client and note type, so it starts in the loading state for each new pair.
 */
export function useNoteRows(client: PackageClient, noteTypeId: number): NoteRowsState {
  const [state, setState] = useState<NoteRowsState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    client.getNotes(noteTypeId).then(
      (rows) => {
        if (!cancelled) setState({ status: 'ready', rows })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: toPackageError(error).message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, noteTypeId])
  return state
}
