import { useEffect, useMemo, useState } from 'react'
import { typesetMath } from '@/features/mathjax/typeset'
import { toPackageError } from '@/features/package/errors'
import type { MediaHandle } from '@/features/package/media-cache'
import type { PackageClient } from '@/features/package/package-client'
import { buildFrame, type ContentScan, type FrameContent, type FrameDocument, type FrameOptions } from './card-document'

export type FramesState =
  | { status: 'loading' }
  | { status: 'ready'; frames: FrameDocument[] }
  | { status: 'failed'; message: string }

type Loaded =
  | { scan: ContentScan; handle: MediaHandle; typeset: FrameContent[] }
  | { scan: ContentScan; message: string }

/** The content with its maths typeset by MathJax (loaded only if there is any). */
async function typesetContent(content: FrameContent): Promise<FrameContent> {
  const { parts, css } = await typesetMath(content.parts.map((part) => part.html))
  if (css === null) return content
  return {
    ...content,
    parts: content.parts.map((part, index) => ({ ...part, html: parts[index] ?? part.html })),
    appCss: css,
  }
}

function typesetFailed(error: unknown): string {
  return `Couldn’t typeset the maths: ${error instanceof Error ? error.message : String(error)}`
}

/**
 * Loads the media some frames need (and holds it while they're shown), typesets their
 * maths, then builds their documents. Pass memoised `contents` and their `scan` (from
 * useContentScan; null while it's being made): a new scan means new frames.
 */
export function useFrames(
  client: PackageClient,
  contents: FrameContent[],
  scan: ContentScan | null,
  { allowScripts, allowWeb, nightMode, canPlay }: FrameOptions,
): FramesState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!scan) return
    let cancelled = false
    let handle: MediaHandle | null = null
    const typesetting = Promise.all(contents.map(typesetContent))
    // Handled below; this only stops an unhandled rejection if the media fails first.
    typesetting.catch(() => undefined)
    client.media.acquire(scan.report.media).then(
      async (acquired) => {
        // Set first, so the cleanup below releases it even while typesetting.
        handle = acquired
        let next: Loaded
        try {
          next = { scan, handle: acquired, typeset: await typesetting }
        } catch (error) {
          next = { scan, message: typesetFailed(error) }
        }
        // Releasing twice is harmless; this covers a cleanup that ran before `handle` was set.
        if (cancelled) acquired.release()
        else setLoaded(next)
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ scan, message: toPackageError(error).message })
      },
    )
    return () => {
      cancelled = true
      // Revokes this card's object URLs; the files stay in the cache for a while.
      handle?.release()
    }
  }, [client, contents, scan])

  return useMemo((): FramesState => {
    // Media for older contents is about to be released; wait for the new set.
    if (!scan || loaded?.scan !== scan) return { status: 'loading' }
    if ('message' in loaded) return { status: 'failed', message: loaded.message }
    const options = { allowScripts, allowWeb, nightMode, canPlay }
    const { handle, typeset } = loaded
    return {
      status: 'ready',
      frames: typeset.map((content) => buildFrame(content, options, handle, scan.stylesheets)),
    }
  }, [loaded, scan, allowScripts, allowWeb, nightMode, canPlay])
}
