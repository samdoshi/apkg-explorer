import type { FileEntry } from '@zip.js/zip.js/index-native.js'
import type { Database, SqlJsStatic } from 'sql.js'
import {
  queryRows,
  readDecks,
  readNoteTypes,
  readSchemaVersion,
  replaceUnicaseCollation,
} from './collection'
import { PackageError } from './errors'
import { parseLegacyMediaMap, parseMediaEntries, type MediaFile } from './media-map'
import { mimeTypeFor } from './mime'
import { ProtoMessage } from './protobuf'
import { readZipEntries, readZipEntry } from './zip'
import { hasZstdMagic, zstdToBlob, zstdToBytes } from './zstd'

export type PackageFormat = 'anki2' | 'anki21' | 'anki21b'

export interface NoteTypeSummary {
  id: number
  name: string
  kind: 'normal' | 'cloze'
  isImageOcclusion: boolean
  fieldNames: string[]
  templateNames: string[]
  noteCount: number
  cardCount: number
}

export interface DeckSummary {
  id: number
  name: string
  cardCount: number
}

export interface PackageSummary {
  fileName: string
  fileSize: number
  format: PackageFormat
  schemaVersion: number
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

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export class AnkiPackage {
  private readonly file: Blob
  private readonly fileName: string
  private readonly db: Database
  private readonly format: PackageFormat
  private readonly entries: Map<string, FileEntry>
  private readonly media: Map<string, MediaFile>

  private constructor(options: {
    file: Blob
    fileName: string
    db: Database
    format: PackageFormat
    entries: Map<string, FileEntry>
    media: MediaFile[]
  }) {
    this.file = options.file
    this.fileName = options.fileName
    this.db = options.db
    this.format = options.format
    this.entries = options.entries
    this.media = new Map(options.media.map((file) => [file.name, file]))
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
    const media = await readMediaMap(file, entries)
    return new AnkiPackage({ file, fileName, db, format: found.format, entries, media })
  }

  summary(): PackageSummary {
    const count = (sql: string) => Number(queryRows(this.db, sql)[0]?.[0] ?? 0)
    const countsBy = (sql: string) =>
      new Map(queryRows(this.db, sql).map(([key, value]) => [Number(key), Number(value)]))

    const notesByType = countsBy('SELECT mid, count(*) FROM notes GROUP BY mid')
    const cardsByType = countsBy(
      'SELECT notes.mid, count(*) FROM cards JOIN notes ON notes.id = cards.nid GROUP BY notes.mid',
    )
    const cardsByDeck = countsBy('SELECT did, count(*) FROM cards GROUP BY did')

    return {
      fileName: this.fileName,
      fileSize: this.file.size,
      format: this.format,
      schemaVersion: readSchemaVersion(this.db),
      noteCount: count('SELECT count(*) FROM notes'),
      cardCount: count('SELECT count(*) FROM cards'),
      mediaCount: this.media.size,
      noteTypes: readNoteTypes(this.db)
        .map((noteType) => ({
          id: noteType.id,
          name: noteType.name,
          kind: noteType.kind,
          isImageOcclusion: noteType.isImageOcclusion,
          fieldNames: noteType.fields.map((field) => field.name),
          templateNames: noteType.templates.map((template) => template.name),
          noteCount: notesByType.get(noteType.id) ?? 0,
          cardCount: cardsByType.get(noteType.id) ?? 0,
        }))
        .sort((a, b) => collator.compare(a.name, b.name)),
      decks: readDecks(this.db)
        .map((deck) => ({ ...deck, cardCount: cardsByDeck.get(deck.id) ?? 0 }))
        .filter((deck) => deck.cardCount > 0)
        .sort((a, b) => collator.compare(a.name, b.name)),
    }
  }

  mediaFiles(): MediaFile[] {
    return [...this.media.values()]
  }

  /** One media file, read from the zip on demand. Null if the package doesn't have it. */
  async readMedia(name: string): Promise<Blob | null> {
    const media = this.media.get(name) ?? this.media.get(name.normalize('NFC'))
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
