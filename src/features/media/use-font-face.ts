import { useEffect, useState } from 'react'
import { readFontInfo, type FontInfo } from './font-file'

export type LoadedFont =
  | { status: 'loading' }
  /** `info` is null when the file couldn't be read for details, though the browser can draw it. */
  | { status: 'ready'; family: string; info: FontInfo | null }
  | { status: 'failed'; info: FontInfo | null }

let previews = 0

/**
 * Reads a font file's details and adds it to the page's fonts, under a family name of its
 * own, while the preview shows it. Nothing is stored: the font goes when the preview does.
 */
export function useFontFace(blob: Blob): LoadedFont {
  const [loaded, setLoaded] = useState<{ blob: Blob; font: LoadedFont } | null>(null)

  useEffect(() => {
    let cancelled = false
    let face: FontFace | null = null
    previews += 1
    const family = `apkg-font-preview-${String(previews)}`
    const load = async (): Promise<LoadedFont> => {
      const buffer = await blob.arrayBuffer()
      const info = await readFontInfo(new Uint8Array(buffer)).catch(() => null)
      try {
        const loading = new FontFace(family, buffer)
        await loading.load()
        if (!cancelled) {
          face = loading
          document.fonts.add(loading)
        }
        return { status: 'ready', family, info }
      } catch {
        return { status: 'failed', info }
      }
    }
    load().then(
      (font) => {
        if (!cancelled) setLoaded({ blob, font })
      },
      () => {
        if (!cancelled) setLoaded({ blob, font: { status: 'failed', info: null } })
      },
    )
    return () => {
      cancelled = true
      if (face) document.fonts.delete(face)
    }
  }, [blob])

  return loaded?.blob === blob ? loaded.font : { status: 'loading' }
}
