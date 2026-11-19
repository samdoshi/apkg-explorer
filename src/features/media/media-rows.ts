import type { MediaListItem } from '@/features/package/media-map'
import { mediaKindFor, type MediaKind } from '@/features/package/mime'
import { normalizeForSearch, searchWords } from '@/lib/search'

/** One media file as the media list shows it. */
export interface MediaRow {
  name: string
  kind: MediaKind
  /** Bytes, or null when the package doesn't say. */
  size: number | null
  /** The name, normalised for search (see lib/search). */
  search: string
}

/** In the order the kind filter and the Kind column's sort use. */
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'other']

export type KindFilter = MediaKind | 'all'

export function isKindFilter(value: string): value is KindFilter {
  return value === 'all' || (MEDIA_KINDS as readonly string[]).includes(value)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function compareNames(a: string, b: string): number {
  return collator.compare(a, b)
}

/** Rows in name order (the package's own order is just the order the files were added). */
export function buildMediaRows(files: readonly MediaListItem[]): MediaRow[] {
  return files
    .map((file) => ({
      name: file.name,
      kind: mediaKindFor(file.name),
      size: file.size,
      search: normalizeForSearch(file.name),
    }))
    .sort((a, b) => compareNames(a.name, b.name))
}

/** Rows of the chosen kind whose names contain every word of the query. */
export function filterMediaRows(rows: readonly MediaRow[], query: string, kind: KindFilter): MediaRow[] {
  const words = searchWords(query)
  return rows.filter(
    (row) => (kind === 'all' || row.kind === kind) && words.every((word) => row.search.includes(word)),
  )
}

export function countKinds(rows: readonly MediaRow[]): Record<MediaKind, number> {
  const counts: Record<MediaKind, number> = { image: 0, audio: 0, video: 0, other: 0 }
  for (const row of rows) counts[row.kind] += 1
  return counts
}

/** Total of the known sizes. */
export function totalSize(rows: readonly MediaRow[]): number {
  return rows.reduce((sum, row) => sum + (row.size ?? 0), 0)
}

/** The route of a file's preview. */
export function mediaPath(name: string): string {
  return `/media/${encodeURIComponent(name)}`
}

/** "PNG", "MP3"…, or "No extension". */
export function extensionLabel(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : 'No extension'
}
