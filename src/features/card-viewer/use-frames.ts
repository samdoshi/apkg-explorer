import { useEffect, useMemo, useState } from 'react'
import { toPackageError } from '@/features/package/errors'
import type { MediaHandle } from '@/features/package/media-cache'
import type { PackageClient } from '@/features/package/package-client'
import { buildFrame, type FrameContent, type FrameDocument, type FrameOptions } from './card-document'
import type { ContentReport } from './sanitize'

export type FramesState =
  | { status: 'loading' }
  | { status: 'ready'; frames: FrameDocument[] }
  | { status: 'failed'; message: string }

type Loaded =
  | { contents: FrameContent[]; handle: MediaHandle }
  | { contents: FrameContent[]; message: string }

/**
 * Loads the media some frames need (and holds it while they're shown), then builds
 * their documents. Pass memoised `contents` and `report`: a new array means new frames.
 */
export function useFrames(
  client: PackageClient,
  contents: FrameContent[],
  report: ContentReport,
  { allowScripts, allowWeb, nightMode, canPlay }: FrameOptions,
): FramesState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    let handle: MediaHandle | null = null
    client.media.acquire(report.media).then(
      (acquired) => {
        if (cancelled) {
          acquired.release()
          return
        }
        handle = acquired
        setLoaded({ contents, handle: acquired })
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ contents, message: toPackageError(error).message })
      },
    )
    return () => {
      cancelled = true
      // Revokes this card's object URLs; the files stay in the cache for a while.
      handle?.release()
    }
  }, [client, contents, report])

  return useMemo((): FramesState => {
    // Media for older contents is about to be released; wait for the new set.
    if (loaded?.contents !== contents) return { status: 'loading' }
    if ('message' in loaded) return { status: 'failed', message: loaded.message }
    const options = { allowScripts, allowWeb, nightMode, canPlay }
    return { status: 'ready', frames: contents.map((content) => buildFrame(content, options, loaded.handle)) }
  }, [loaded, contents, allowScripts, allowWeb, nightMode, canPlay])
}
