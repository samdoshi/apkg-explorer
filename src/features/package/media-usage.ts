import type { NoteTypeInfo } from './collection'
import { cssReferences, htmlReferences, type References } from './media-references'

/** Somewhere other than a note's fields that refers to a file. */
export type MediaPlace =
  | { kind: 'templates' | 'styling'; noteType: string }
  /** A stylesheet from the package (e.g. `_style.css`, @imported by a note type's styling). */
  | { kind: 'stylesheet'; name: string }

export interface MediaUsage {
  /** False for a file that's referred to but isn't in the package. */
  inPackage: boolean
  /** Notes whose fields refer to it, in creation order. */
  noteIds: number[]
  places: MediaPlace[]
}

/** A media file as the media browser lists it: the package's files, then missing ones. */
export interface MediaListItem {
  name: string
  /** Bytes, when known; null for a missing file. */
  size: number | null
  missing: boolean
  noteCount: number
  /** Used by note types' templates or styling, or by a package stylesheet. */
  usedElsewhere: boolean
}

/** What the media preview shows about where a file is used. */
export interface MediaUse {
  noteCount: number
  /** The first notes (up to a limit), with their sort field as plain text. */
  notes: { id: number; noteTypeId: number; text: string }[]
  places: MediaPlace[]
}

interface Sources {
  /** Every note's id and fields (\x1f-separated), in creation order. */
  notes: Iterable<{ id: number; fields: string }>
  noteTypes: readonly NoteTypeInfo[]
  /** The package's name for a referenced file, or null if it isn't in the package. */
  resolve: (reference: string) => string | null
  /** A package file's text, or null if it can't be read. */
  readText: (name: string) => Promise<string | null>
}

/** Package stylesheets importing stylesheets: how deep they're followed (as in the card viewer). */
const STYLESHEET_DEPTH = 8

/**
 * Where each file is used, keyed by its package name (or by the name as written, for one
 * that isn't in the package). Files that nothing refers to aren't in the map.
 */
export async function findMediaUsage({ notes, noteTypes, resolve, readText }: Sources): Promise<Map<string, MediaUsage>> {
  const usage = new Map<string, MediaUsage>()
  const entry = (reference: string) => {
    const name = resolve(reference)
    const key = name ?? reference.normalize('NFC')
    let found = usage.get(key)
    if (!found) {
      found = { inPackage: name !== null, noteIds: [], places: [] }
      usage.set(key, found)
    }
    return { key, found }
  }
  let stylesheets: string[] = []
  const add = (references: References, record: (found: MediaUsage) => void) => {
    for (const reference of references.files) record(entry(reference).found)
    for (const reference of references.stylesheets) {
      const { key, found } = entry(reference)
      if (found.inPackage) stylesheets.push(key)
    }
  }

  for (const note of notes) {
    add(htmlReferences(note.fields), (found) => found.noteIds.push(note.id))
  }
  for (const noteType of noteTypes) {
    const templates = noteType.templates.map((template) => template.front + template.back).join('\n')
    add(htmlReferences(templates), (found) => found.places.push({ kind: 'templates', noteType: noteType.name }))
    add(cssReferences(noteType.css), (found) => found.places.push({ kind: 'styling', noteType: noteType.name }))
  }

  const read = new Set<string>()
  for (let depth = 0; depth < STYLESHEET_DEPTH && stylesheets.length > 0; depth++) {
    const level = [...new Set(stylesheets)].filter((name) => !read.has(name))
    stylesheets = []
    for (const name of level) {
      read.add(name)
      const text = await readText(name)
      if (text !== null) add(cssReferences(text), (found) => found.places.push({ kind: 'stylesheet', name }))
    }
  }
  return usage
}
