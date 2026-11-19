import { useEffect, useState } from 'react'
import { toPackageError } from '@/features/package/errors'
import type { MediaHandle } from '@/features/package/media-cache'
import type { PackageClient } from '@/features/package/package-client'

export type MediaFileState =
  | { status: 'loading' }
  | { status: 'ready'; blob: Blob; url: string }
  /** Listed in the package's media list, but the file itself isn't in the package. */
  | { status: 'missing' }
  | { status: 'failed'; message: string }

/**
 * Reads one media file through the package's media cache and holds its object URL
 * until the file changes or the component unmounts.
 */
export function useMediaFile(client: PackageClient, name: string): MediaFileState {
  const [loaded, setLoaded] = useState<{ client: PackageClient; name: string; state: MediaFileState } | null>(null)

  useEffect(() => {
    let cancelled = false
    let handle: MediaHandle | null = null
    client.media.acquire([name]).then(
      (acquired) => {
        if (cancelled) {
          acquired.release()
          return
        }
        handle = acquired
        const blob = acquired.blob(name)
        const url = acquired.url(name)
        setLoaded({ client, name, state: blob && url ? { status: 'ready', blob, url } : { status: 'missing' } })
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ client, name, state: { status: 'failed', message: toPackageError(error).message } })
      },
    )
    return () => {
      cancelled = true
      // Revokes the object URL; the file stays in the cache for a while.
      handle?.release()
    }
  }, [client, name])

  if (loaded?.client !== client || loaded.name !== name) return { status: 'loading' }
  return loaded.state
}
