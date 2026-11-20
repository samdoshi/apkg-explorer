import type { MediaListItem } from '@/features/package/media-usage'
import { mediaKindFor, type MediaKind } from '@/features/package/mime'
import { compareText, formatCount } from '@/lib/format'
import { normalizeForSearch, searchWords } from '@/lib/search'

/** One media file as the media list shows it. */
export interface MediaRow {
  name: string
  kind: MediaKind
  /** Bytes, or null when the package doesn't say (or doesn't have the file). */
  size: number | null
  /** Notes, templates or styling refer to it, but the package doesn't have it. */
  missing: boolean
  /** How many notes' fields refer to it. */
  noteCount: number
  /** Used by note types' templates or styling, or by a package stylesheet. */
  usedElsewhere: boolean
  /** The name, normalised for search (see lib/search). */
  search: string
}

/** In the order the kind filter and the Kind column's sort use. */
export const MEDIA_KINDS: readonly MediaKind[] = ['image', 'audio', 'video', 'font', 'other']

export type KindFilter = MediaKind | 'all'

export function isKindFilter(value: string): value is KindFilter {
  return value === 'all' || (MEDIA_KINDS as readonly string[]).includes(value)
}

/** 'any' is every file in the package; 'missing' are the ones it lacks. */
export type UsageFilter = 'any' | 'used' | 'unused' | 'missing'

export function isUsageFilter(value: string): value is UsageFilter {
  return ['any', 'used', 'unused', 'missing'].includes(value)
}

export const isUsed = (row: MediaRow) => row.noteCount > 0 || row.usedElsewhere

export function matchesUsage(row: MediaRow, usage: UsageFilter): boolean {
  if (usage === 'missing') return row.missing
  if (row.missing) return false
  return usage === 'any' || isUsed(row) === (usage === 'used')
}

/** The "Used by" column's text, and a fuller description for its tooltip. */
export function usageLabel(row: MediaRow): { short: string; long: string } {
  const notes = formatCount(row.noteCount, 'note')
  if (row.noteCount > 0) {
    return { short: notes, long: row.usedElsewhere ? `${notes}, and card templates or styling` : notes }
  }
  if (row.usedElsewhere) return { short: 'Templates', long: 'Card templates or styling' }
  return { short: 'Unused', long: 'Nothing in the package refers to it' }
}

export function countUsage(rows: readonly MediaRow[]): Record<Exclude<UsageFilter, 'any'>, number> {
  const counts = { used: 0, unused: 0, missing: 0 }
  for (const row of rows) counts[row.missing ? 'missing' : isUsed(row) ? 'used' : 'unused'] += 1
  return counts
}

/** Rows in name order (the package's own order is just the order the files were added). */
export function buildMediaRows(files: readonly MediaListItem[]): MediaRow[] {
  return files
    .map((file) => ({ ...file, kind: mediaKindFor(file.name), search: normalizeForSearch(file.name) }))
    .sort((a, b) => compareText(a.name, b.name))
}

/** Rows of the chosen kind whose names contain every word of the query. */
export function filterMediaRows(rows: readonly MediaRow[], query: string, kind: KindFilter): MediaRow[] {
  const words = searchWords(query)
  return rows.filter(
    (row) => (kind === 'all' || row.kind === kind) && words.every((word) => row.search.includes(word)),
  )
}

export function countKinds(rows: readonly MediaRow[]): Record<MediaKind, number> {
  const counts: Record<MediaKind, number> = { image: 0, audio: 0, video: 0, font: 0, other: 0 }
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
