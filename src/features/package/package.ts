import type { FileEntry } from '@zip.js/zip.js/index-native.js'
import type { Database, SqlJsStatic } from 'sql.js'
import {
  asNumber,
  asString,
  queryRows,
  readDecks,
  readNoteTypes,
  readSchemaVersion,
  replaceUnicaseCollation,
  type DeckInfo,
  type NoteTypeInfo,
} from './collection'
import { PackageError } from './errors'
import { htmlToText, type MediaRef } from './html-text'
import { parseLegacyMediaMap, parseMediaEntries, type MediaFile, type MediaListItem } from './media-map'
import { mimeTypeFor } from './mime'
import type { CardDetail, NoteDetail } from './note-detail'
import type { NoteRow } from './note-row'
import { ProtoMessage } from './protobuf'
import { readZipEntries, readZipEntry } from './zip'
import { hasZstdMagic, zstdToBlob, zstdToBytes } from './zstd'
import { compareText } from '@/lib/format'
import { normalizeForSearch } from '@/lib/search'

export type PackageFormat = 'anki2' | 'anki21' | 'anki21b'

export interface NoteTypeSummary {
  id: number
  name: string
  kind: 'normal' | 'cloze'
  isImageOcclusion: boolean
  /** The field shown as a note's title (Anki's sort field). */
  sortFieldIndex: number
  fieldNames: string[]
  templateNames: string[]
  noteCount: number
  cardCount: number
}

export interface DeckSummary {
  id: number
  name: string
  /** A filtered deck: its cards also count towards their home decks. */
  filtered: boolean
  /** Cards whose home deck this is; for a filtered deck, the cards in it. */
  cardCount: number
}

export interface PackageSummary {
  fileName: string
  fileSize: number
  format: PackageFormat
  schemaVersion: number
  /** When the collection was created (ms since epoch); review due dates count days from it. */
  collectionCreated: number
  noteCount: number
  cardCount: number
  mediaCount: number
  noteTypes: NoteTypeSummary[]
  decks: DeckSummary[]
}

/** Newest first: a package can hold an old-format stub next to the real collection. */
const COLLECTION_FILES: readonly (readonly [string, PackageFormat])[] = [
  ['collection.anki21b', 'anki21b'],
  ['collection.anki21', 'anki21'],
  ['collection.anki2', 'anki2'],
]

/** PackageMetadata.Version.VERSION_LATEST, the newest version we understand. */
const LATEST_PACKAGE_VERSION = 3

export class AnkiPackage {
  private readonly file: Blob
  private readonly fileName: string
  private readonly db: Database
  private readonly format: PackageFormat
  private readonly entries: Map<string, FileEntry>
  private readonly media: Map<string, MediaFile>
  private readonly noteTypes: Map<number, NoteTypeInfo>
  private readonly decks: DeckInfo[]
  private readonly deckNames: Map<number, string>

  private constructor(options: {
    file: Blob
    fileName: string
    db: Database
    format: PackageFormat
    entries: Map<string, FileEntry>
    media: MediaFile[]
    structure: Structure
  }) {
    this.file = options.file
    this.fileName = options.fileName
    this.db = options.db
    this.format = options.format
    this.entries = options.entries
    this.media = new Map(options.media.map((file) => [file.name, file]))
    this.noteTypes = new Map(options.structure.noteTypes.map((noteType) => [noteType.id, noteType]))
    this.decks = options.structure.decks
    this.deckNames = new Map(this.decks.map((deck) => [deck.id, deck.name]))
  }

  /**
   * Reads the zip directory, the package metadata, the media map and the collection
   * database. Media files themselves are left in the zip until asked for.
   */
  static async open(file: Blob, fileName: string, sql: SqlJsStatic): Promise<AnkiPackage> {
    const entries = await readZipEntries(file)

    const metaEntry = entries.get('meta')
    if (metaEntry) {
      const version = ProtoMessage.decode(await readBytes(file, metaEntry)).uint(1)
      if (version > LATEST_PACKAGE_VERSION) throw new PackageError('newer-version')
    }

    const found = COLLECTION_FILES.flatMap(([name, format]) => {
      const entry = entries.get(name)
      return entry ? [{ entry, format }] : []
    })[0]
    if (!found) throw new PackageError('no-collection')

    const raw = await readBytes(file, found.entry)
    const db = openDatabase(sql, found.format === 'anki21b' ? await unzstd(raw) : raw)
    try {
      const structure = readStructure(db)
      const media = await readMediaMap(file, entries)
      return new AnkiPackage({ file, fileName, db, format: found.format, entries, media, structure })
    } catch (error) {
      db.close()
      throw error
    }
  }

  summary(): PackageSummary {
    const count = (sql: string) => Number(queryRows(this.db, sql)[0]?.[0] ?? 0)
    const countsBy = (sql: string) =>
      new Map(queryRows(this.db, sql).map(([key, value]) => [Number(key), Number(value)]))

    const notesByType = countsBy('SELECT mid, count(*) FROM notes GROUP BY mid')
    const cardsByType = countsBy(
      'SELECT notes.mid, count(*) FROM cards JOIN notes ON notes.id = cards.nid GROUP BY notes.mid',
    )
    // A card in a filtered deck counts towards its home deck (odid) and the filtered deck.
    const cardsByHomeDeck = countsBy(`SELECT ${HOME_DECK}, count(*) FROM cards GROUP BY 1`)
    const cardsInFilteredDecks = countsBy('SELECT did, count(*) FROM cards WHERE odid != 0 GROUP BY did')

    return {
      fileName: this.fileName,
      fileSize: this.file.size,
      format: this.format,
      schemaVersion: readSchemaVersion(this.db),
      collectionCreated: count('SELECT crt FROM col') * 1000,
      noteCount: count('SELECT count(*) FROM notes'),
      cardCount: count('SELECT count(*) FROM cards'),
      mediaCount: this.media.size,
      noteTypes: [...this.noteTypes.values()]
        .map((noteType) => ({
          id: noteType.id,
          name: noteType.name,
          kind: noteType.kind,
          isImageOcclusion: noteType.isImageOcclusion,
          sortFieldIndex: noteType.sortFieldIndex,
          fieldNames: noteType.fields.map((field) => field.name),
          templateNames: noteType.templates.map((template) => template.name),
          noteCount: notesByType.get(noteType.id) ?? 0,
          cardCount: cardsByType.get(noteType.id) ?? 0,
        }))
        .sort((a, b) => compareText(a.name, b.name)),
      decks: this.decks
        .map((deck) => ({
          ...deck,
          cardCount: (deck.filtered ? cardsInFilteredDecks : cardsByHomeDeck).get(deck.id) ?? 0,
        }))
        .filter((deck) => deck.cardCount > 0)
        .sort((a, b) => compareText(a.name, b.name)),
    }
  }

  /** Every note of one note type, in creation order, ready for the table. */
  notes(noteTypeId: number): NoteRow[] {
    const fieldCount = this.noteTypes.get(noteTypeId)?.fields.length ?? 0
    const rows: NoteRow[] = []
    // Home decks, as in the card popup: a filtered deck only borrows cards. (The notes
    // table has no deck columns, so HOME_DECK's names are the card's.)
    const statement = this.db.prepare(
      `SELECT notes.id, notes.mod, notes.tags, notes.flds,
              group_concat(DISTINCT ${HOME_DECK}), count(cards.id)
       FROM notes LEFT JOIN cards ON cards.nid = notes.id
       WHERE notes.mid = ?
       GROUP BY notes.id
       ORDER BY notes.id`,
    )
    try {
      statement.bind([noteTypeId])
      while (statement.step()) {
        const [id, mod, tags, flds, deckIds, cardCount] = statement.get()
        const rawFields = String(flds ?? '').split('\x1f')
        const fields: string[] = []
        const media: Record<number, MediaRef[]> = {}
        for (let index = 0; index < Math.max(fieldCount, rawFields.length); index++) {
          const { text, media: refs } = htmlToText(rawFields[index] ?? '')
          fields.push(text)
          if (refs.length) media[index] = refs
        }
        const tagList = String(tags ?? '').split(/\s+/).filter(Boolean)
        const decks = String(deckIds ?? '')
          .split(',')
          .filter(Boolean)
          .map((deckId) => this.deckName(Number(deckId)))
        rows.push({
          id: Number(id),
          fields,
          media,
          tags: tagList,
          decks,
          cardCount: Number(cardCount),
          created: Number(id),
          modified: Number(mod) * 1000,
          search: normalizeForSearch([...fields, ...tagList, ...decks].join('\n')),
        })
      }
    } finally {
      statement.free()
    }
    return rows
  }

  /** A note type's fields, templates and CSS, for rendering cards. */
  noteType(noteTypeId: number): NoteTypeInfo | null {
    return this.noteTypes.get(noteTypeId) ?? null
  }

  /** One note with its raw field HTML and its cards. Null if there's no such note. */
  note(noteId: number): NoteDetail | null {
    const [note] = queryRows(this.db, 'SELECT id, mid, mod, tags, flds FROM notes WHERE id = ?', [noteId])
    if (!note) return null
    const [id, mid, mod, tags, flds] = note
    const cards = queryRows(
      this.db,
      `SELECT id, ord, did, odid, type, queue, due, odue, ivl, factor, reps, lapses, flags
       FROM cards WHERE nid = ? ORDER BY ord, id`,
      [noteId],
    ).map((row): CardDetail => {
      const [cardId, ord, did, odid, type, queue, due, odue, ivl, factor, reps, lapses, flags] =
        row.map(asNumber)
      // A card in a filtered deck keeps its home deck in odid and its real due date in odue.
      const filtered = odid !== undefined && odid !== 0
      return {
        id: cardId ?? 0,
        ord: ord ?? 0,
        deckName: this.deckName(filtered ? odid : did),
        filteredDeckName: filtered ? this.deckName(did) : null,
        type: type ?? 0,
        queue: queue ?? 0,
        due: (filtered ? odue : due) ?? 0,
        interval: ivl ?? 0,
        factor: factor ?? 0,
        reps: reps ?? 0,
        lapses: lapses ?? 0,
        flag: (flags ?? 0) & 0b111,
      }
    })
    return {
      id: asNumber(id),
      noteTypeId: asNumber(mid),
      fields: asString(flds).split('\x1f'),
      tags: asString(tags).split(/\s+/).filter(Boolean),
      created: asNumber(id),
      modified: asNumber(mod) * 1000,
      cards,
    }
  }

  mediaFiles(): MediaFile[] {
    return [...this.media.values()]
  }

  /** Every media file's name and size, for the media browser. */
  mediaList(): MediaListItem[] {
    return this.mediaFiles().map(({ name, size }) => ({ name, size }))
  }

  /**
   * One media file, read from the zip on demand. Null if the package doesn't have it.
   * Names are matched as written, then NFC-normalised, then percent-decoded (some
   * editors write `my%20file.jpg` in the HTML for `my file.jpg`).
   */
  async readMedia(name: string): Promise<Blob | null> {
    const media = this.findMedia(name) ?? this.findMedia(percentDecode(name))
    const entry = media && this.entries.get(media.zipName)
    if (!entry) return null
    const type = mimeTypeFor(name)
    const blob = await readZipEntry(this.file, entry, type)
    if (this.format === 'anki21b') {
      const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
      if (hasZstdMagic(head)) return zstdToBlob(blob, type)
    }
    return blob
  }

  close() {
    this.db.close()
  }

  private deckName(deckId = 0): string {
    return this.deckNames.get(deckId) ?? `Unknown deck ${String(deckId)}`
  }

  private findMedia(name: string | null): MediaFile | undefined {
    if (!name) return undefined
    return this.media.get(name) ?? this.media.get(name.normalize('NFC'))
  }
}

/** A card's home deck: the deck it came from if it sits in a filtered deck. */
const HOME_DECK = 'CASE WHEN odid != 0 THEN odid ELSE did END'

interface Structure {
  noteTypes: NoteTypeInfo[]
  decks: DeckInfo[]
}

/** Note types and decks don't change while a file is open, so they're read once. */
function readStructure(db: Database): Structure {
  try {
    return { noteTypes: readNoteTypes(db), decks: readDecks(db) }
  } catch (error) {
    if (error instanceof PackageError) throw error
    // Broken JSON (older schemas) or protobuf (schema 18) in a database SQLite could read.
    throw new PackageError('corrupt', 'unreadable note types or decks')
  }
}

function percentDecode(name: string): string | null {
  if (!name.includes('%')) return null
  try {
    return decodeURIComponent(name)
  } catch {
    return null
  }
}

async function readBytes(file: Blob, entry: FileEntry): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (await readZipEntry(file, entry)).arrayBuffer())
}

async function unzstd(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return hasZstdMagic(bytes) ? zstdToBytes(new Blob([bytes])) : bytes
}

async function readMediaMap(file: Blob, entries: Map<string, FileEntry>): Promise<MediaFile[]> {
  const entry = entries.get('media')
  if (!entry) return []
  const bytes = await readBytes(file, entry)
  let files: MediaFile[]
  try {
    files = hasZstdMagic(bytes)
      ? parseMediaEntries(await zstdToBytes(new Blob([bytes])))
      : parseLegacyMediaMap(new TextDecoder().decode(bytes))
  } catch (error) {
    if (error instanceof PackageError || error instanceof DOMException) throw error
    throw new PackageError('corrupt', 'unreadable media list')
  }
  // Legacy maps have no sizes, but their zip entries hold the files uncompressed.
  return files.map((media) => ({
    ...media,
    size: media.size ?? entries.get(media.zipName)?.uncompressedSize ?? null,
  }))
}

const SQLITE_HEADER = 'SQLite format 3\0'

function openDatabase(sql: SqlJsStatic, bytes: Uint8Array): Database {
  const header = new TextDecoder().decode(bytes.subarray(0, 16))
  if (header !== SQLITE_HEADER) throw new PackageError('corrupt', 'not a SQLite database')
  // A WAL-mode header (bytes 18-19 = 2) would make SQLite look for a -wal file that a
  // package never has. Mark it as an ordinary rollback-journal database instead.
  if (bytes[18] === 2) bytes[18] = 1
  if (bytes[19] === 2) bytes[19] = 1
  let db: Database | undefined
  try {
    db = new sql.Database(bytes)
    replaceUnicaseCollation(db)
    db.exec('SELECT count(*) FROM notes; SELECT count(*) FROM cards; SELECT ver FROM col')
    return db
  } catch (error) {
    db?.close()
    const detail = error instanceof Error ? error.message : undefined
    throw new PackageError('corrupt', detail)
  }
}
