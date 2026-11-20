import type { Database } from 'sql.js'
import { ProtoMessage } from './protobuf'

export interface FieldInfo {
  ord: number
  name: string
}

export interface TemplateInfo {
  ord: number
  name: string
  front: string
  back: string
}

export interface NoteTypeInfo {
  id: number
  name: string
  kind: 'normal' | 'cloze'
  /** Anki 23.10+ image occlusion note types (a special kind of cloze). */
  isImageOcclusion: boolean
  sortFieldIndex: number
  css: string
  fields: FieldInfo[]
  templates: TemplateInfo[]
}

export interface DeckInfo {
  id: number
  name: string
  /** A filtered deck borrows cards from their home decks (cards.odid keeps the home deck). */
  filtered: boolean
}

const IMAGE_OCCLUSION_STOCK_KIND = 6
/** DeckKindContainer, schema 18's `decks.kind`: field 1 is a normal deck, 2 a filtered one. */
const FILTERED_DECK_KIND = 2

/** Runs a query and returns every row as an array of column values. */
export function queryRows(db: Database, sql: string, params?: (string | number)[]): unknown[][] {
  const [result] = db.exec(sql, params)
  return result?.values ?? []
}

export const asNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value))
export const asString = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
const asBytes = (value: unknown): Uint8Array =>
  value instanceof Uint8Array ? value : new Uint8Array(0)

/**
 * Schema 15+ declares note type, field, template, deck and tag names with Anki's own
 * `unicase` collation. sql.js can't register collations, and SQLite refuses to read a
 * WITHOUT ROWID table (fields, templates, tags) whose schema names a missing one. This
 * rewrites our in-memory copy of the schema to use SQLite's built-in NOCASE instead,
 * which orders names the same way for ASCII. The package file itself is never changed.
 */
export function replaceUnicaseCollation(db: Database) {
  const entries = queryRows(db, "SELECT name, sql FROM sqlite_master WHERE sql LIKE '%unicase%'")
  if (entries.length === 0) return
  const version = Number(queryRows(db, 'PRAGMA schema_version')[0]?.[0] ?? 0)
  db.exec('PRAGMA writable_schema = ON')
  for (const [name, sql] of entries) {
    db.run('UPDATE sqlite_master SET sql = ? WHERE name = ?', [
      asString(sql).replace(/COLLATE\s+unicase\b/gi, 'COLLATE NOCASE'),
      asString(name),
    ])
  }
  // Bumping the schema version makes SQLite re-read the schema before the next query.
  db.exec(`PRAGMA schema_version = ${version + 1}`)
  db.exec('PRAGMA writable_schema = OFF')
}

/** Schema 15+ keeps note types and decks in their own tables; older ones use JSON in `col`. */
export function usesSeparateTables(db: Database): boolean {
  return queryRows(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notetypes'")
    .length > 0
}

export function readSchemaVersion(db: Database): number {
  return asNumber(queryRows(db, 'SELECT ver FROM col')[0]?.[0] ?? 0)
}

export function readNoteTypes(db: Database): NoteTypeInfo[] {
  return usesSeparateTables(db) ? readNoteTypesFromTables(db) : readNoteTypesFromJson(db)
}

export function readDecks(db: Database): DeckInfo[] {
  if (usesSeparateTables(db)) {
    // Schema 18 separates deck name levels with \x1f instead of "::".
    return queryRows(db, 'SELECT id, name, kind FROM decks').map(([id, name, kind]) => ({
      id: asNumber(id),
      name: asString(name).replaceAll('\x1f', '::'),
      filtered: ProtoMessage.decode(asBytes(kind)).has(FILTERED_DECK_KIND),
    }))
  }
  const json = parseJsonObject(queryRows(db, 'SELECT decks FROM col')[0]?.[0])
  return Object.values(json).flatMap((deck) => {
    if (!isRecord(deck)) return []
    // "dyn" (dynamic) is the old name for a filtered deck.
    return [{ id: asNumber(deck.id), name: asString(deck.name), filtered: deck.dyn === 1 || deck.dyn === true }]
  })
}

function readNoteTypesFromTables(db: Database): NoteTypeInfo[] {
  const fields = new Map<number, FieldInfo[]>()
  for (const [ntid, ord, name] of queryRows(db, 'SELECT ntid, ord, name FROM fields')) {
    pushTo(fields, asNumber(ntid), { ord: asNumber(ord), name: asString(name) })
  }
  const templates = new Map<number, TemplateInfo[]>()
  for (const [ntid, ord, name, config] of queryRows(
    db,
    'SELECT ntid, ord, name, config FROM templates',
  )) {
    const message = ProtoMessage.decode(asBytes(config))
    pushTo(templates, asNumber(ntid), {
      ord: asNumber(ord),
      name: asString(name),
      front: message.string(1),
      back: message.string(2),
    })
  }
  return queryRows(db, 'SELECT id, name, config FROM notetypes').map(([id, name, config]) => {
    const message = ProtoMessage.decode(asBytes(config))
    const noteTypeId = asNumber(id)
    return {
      id: noteTypeId,
      name: asString(name),
      kind: message.uint(1) === 1 ? 'cloze' : 'normal',
      isImageOcclusion: message.uint(9) === IMAGE_OCCLUSION_STOCK_KIND,
      sortFieldIndex: message.uint(2),
      css: message.string(3),
      fields: byOrd(fields.get(noteTypeId) ?? []),
      templates: byOrd(templates.get(noteTypeId) ?? []),
    }
  })
}

function readNoteTypesFromJson(db: Database): NoteTypeInfo[] {
  const json = parseJsonObject(queryRows(db, 'SELECT models FROM col')[0]?.[0])
  return Object.values(json).flatMap((model): NoteTypeInfo[] => {
    if (!isRecord(model)) return []
    const fields = Array.isArray(model.flds) ? model.flds.filter(isRecord) : []
    const templates = Array.isArray(model.tmpls) ? model.tmpls.filter(isRecord) : []
    return [
      {
        id: asNumber(model.id),
        name: asString(model.name),
        kind: model.type === 1 ? 'cloze' : 'normal',
        isImageOcclusion: false,
        sortFieldIndex: asNumber(model.sortf ?? 0),
        css: asString(model.css),
        fields: byOrd(fields.map((f, i) => ({ ord: asNumber(f.ord ?? i), name: asString(f.name) }))),
        templates: byOrd(
          templates.map((t, i) => ({
            ord: asNumber(t.ord ?? i),
            name: asString(t.name),
            front: asString(t.qfmt),
            back: asString(t.afmt),
          })),
        ),
      },
    ]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value === '') return {}
  const parsed: unknown = JSON.parse(value)
  return isRecord(parsed) ? parsed : {}
}

function pushTo<T>(map: Map<number, T[]>, key: number, value: T) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function byOrd<T extends { ord: number }>(items: T[]): T[] {
  return items.toSorted((a, b) => a.ord - b.ord)
}
