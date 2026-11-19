import { useEffect, useState } from 'react'
import { toPackageError } from '@/features/package/errors'
import type { PackageClient } from '@/features/package/package-client'
import { buildMediaRows, type MediaRow } from './media-rows'

export type MediaListState =
  | { status: 'loading' }
  | { status: 'ready'; rows: MediaRow[] }
  | { status: 'failed'; message: string }

/** Loads the package's media list. The calling component is keyed by client. */
export function useMediaList(client: PackageClient): MediaListState {
  const [state, setState] = useState<MediaListState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    client.getMediaList().then(
      (files) => {
        if (!cancelled) setState({ status: 'ready', rows: buildMediaRows(files) })
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: toPackageError(error).message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [client])
  return state
}
