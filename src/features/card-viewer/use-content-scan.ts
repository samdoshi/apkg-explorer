import { useEffect, useMemo, useState } from 'react'
import type { MediaCache } from '@/features/package/media-cache'
import type { PackageClient } from '@/features/package/package-client'
import { scanContent, scanWithStylesheets, type ContentScan, type FrameContent, type StylesheetTexts } from './card-document'

const NO_STYLESHEETS: StylesheetTexts = new Map()

/**
 * Package stylesheets' text. A file that can't be read counts as missing; if the package
 * itself can't be read, loading the card's media reports it.
 */
async function readStylesheets(media: MediaCache, names: string[]): Promise<StylesheetTexts> {
  try {
    const handle = await media.acquire(names)
    try {
      const texts = await Promise.all(names.map(async (name) => (await handle.blob(name)?.text()) ?? null))
      return new Map(names.map((name, index) => [name, texts[index] ?? null]))
    } finally {
      handle.release()
    }
  } catch {
    return NO_STYLESHEETS
  }
}

/**
 * What some content does and needs (see scanContent). Content that uses stylesheets from
 * the package is scanned again once they're read; until then this is null.
 */
export function useContentScan(client: PackageClient, contents: FrameContent[]): ContentScan | null {
  const first = useMemo(() => ({ report: scanContent(contents), stylesheets: NO_STYLESHEETS }), [contents])
  const usesStylesheets = first.report.stylesheets.length > 0
  const [read, setRead] = useState<{ contents: FrameContent[]; scan: ContentScan } | null>(null)

  useEffect(() => {
    if (!usesStylesheets) return
    let cancelled = false
    void scanWithStylesheets(contents, (names) => readStylesheets(client.media, names)).then((scan) => {
      if (!cancelled) setRead({ contents, scan })
    })
    return () => {
      cancelled = true
    }
  }, [client, contents, usesStylesheets])

  if (!usesStylesheets) return first
  return read?.contents === contents ? read.scan : null
}
