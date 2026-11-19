/*
 * Reads what the font preview shows from a font file: its names, which characters it has
 * (the cmap table), glyph names (post), variation axes (fvar) and the kind of outlines.
 * Handles TrueType and OpenType files (.ttf, .otf), collections (.ttc: the first font),
 * WOFF (zlib, which browsers decompress natively) and WOFF2 (Brotli, which not every
 * browser can, so a decoder is loaded for it).
 */

export interface FontAxis {
  tag: string
  /** "Weight", from the font's own names when it has one. */
  name: string
  min: number
  default: number
  max: number
}

export interface FontInfo {
  container: 'sfnt' | 'collection' | 'woff' | 'woff2'
  /** How many fonts a collection holds (the rest of this is about the first). */
  fontCount: number
  outlines: 'TrueType' | 'CFF' | 'CFF2' | 'bitmap' | null
  family: string | null
  style: string | null
  version: string | null
  copyright: string | null
  glyphCount: number | null
  /** Code points the font has a glyph for, ascending. */
  codePoints: Uint32Array
  /** The glyph each of `codePoints` maps to. */
  glyphIds: Uint32Array
  /** Glyph names from the post table, for glyphs that have names of their own. */
  glyphNames: ReadonlyMap<number, string>
  axes: FontAxis[]
  /** Colour glyph tables (emoji fonts): COLR, CBDT, sbix, SVG. */
  colourTables: string[]
}

export class FontFileError extends Error {}

const WANTED = ['cmap', 'name', 'post', 'maxp', 'fvar']
const COLOUR_TABLES = ['COLR', 'CBDT', 'sbix', 'SVG ']
/** No font maps more code points than Unicode has; this stops a broken cmap from running away. */
const MAX_CODE_POINTS = 0x110000

const tagValue = (tag: string) => (tag.charCodeAt(0) << 24) | (tag.charCodeAt(1) << 16) | (tag.charCodeAt(2) << 8) | tag.charCodeAt(3)
const SFNT_TRUETYPE = 0x00010000
const SFNT_APPLE = tagValue('true')
const SFNT_CFF = tagValue('OTTO')
const COLLECTION = tagValue('ttcf')
const WOFF = tagValue('wOFF')
const WOFF2 = tagValue('wOF2')

function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

function slice(view: DataView, offset: number, length: number): DataView {
  if (offset + length > view.byteLength) throw new FontFileError('A table runs past the end of the file.')
  return new DataView(view.buffer, view.byteOffset + offset, length)
}

interface Tables {
  container: FontInfo['container']
  fontCount: number
  tags: string[]
  tables: Map<string, DataView>
}

/** The table directory of an sfnt (TrueType/OpenType) font starting at `start`. */
function sfntTables(view: DataView, start: number): Pick<Tables, 'tags' | 'tables'> {
  const count = view.getUint16(start + 4)
  const tags: string[] = []
  const tables = new Map<string, DataView>()
  for (let i = 0; i < count; i++) {
    const record = start + 12 + i * 16
    const tag = tagAt(view, record)
    tags.push(tag)
    if (WANTED.includes(tag)) tables.set(tag, slice(view, view.getUint32(record + 8), view.getUint32(record + 12)))
  }
  return { tags, tables }
}

async function inflate(data: DataView): Promise<DataView> {
  // A copy, so the Blob gets an ArrayBuffer of its own.
  const stream = new Blob([new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  return new DataView(await new Response(stream).arrayBuffer())
}

async function woffTables(view: DataView): Promise<Tables> {
  const count = view.getUint16(12)
  const tags: string[] = []
  const tables = new Map<string, DataView>()
  for (let i = 0; i < count; i++) {
    const record = 44 + i * 20
    const tag = tagAt(view, record)
    tags.push(tag)
    if (!WANTED.includes(tag)) continue
    const data = slice(view, view.getUint32(record + 4), view.getUint32(record + 8))
    // A table is stored as it is when compressing wouldn't make it smaller.
    tables.set(tag, data.byteLength < view.getUint32(record + 12) ? await inflate(data) : data)
  }
  return { container: 'woff', fontCount: 1, tags, tables }
}

/** The tags WOFF2 gives by number, in its order. */
const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
]

/** Reads WOFF2's variable-length numbers, moving along as it goes. */
class Cursor {
  private readonly view: DataView
  offset: number

  constructor(view: DataView, offset: number) {
    this.view = view
    this.offset = offset
  }

  tag(): string {
    const tag = tagAt(this.view, this.offset)
    this.offset += 4
    return tag
  }

  u8(): number {
    return this.view.getUint8(this.offset++)
  }

  u16(): number {
    const value = this.view.getUint16(this.offset)
    this.offset += 2
    return value
  }

  u32(): number {
    const value = this.view.getUint32(this.offset)
    this.offset += 4
    return value
  }

  base128(): number {
    let value = 0
    for (let i = 0; i < 5; i++) {
      const byte = this.u8()
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) return value
    }
    throw new FontFileError('Bad number in the WOFF2 table directory.')
  }

  u255(): number {
    const code = this.u8()
    if (code === 253) return this.u16()
    if (code === 254) return this.u8() + 253 * 2
    if (code === 255) return this.u8() + 253
    return code
  }
}

async function woff2Tables(view: DataView): Promise<Tables> {
  const flavor = view.getUint32(4)
  const count = view.getUint16(12)
  const compressedSize = view.getUint32(20)
  const cursor = new Cursor(view, 48)
  const entries: { tag: string; length: number }[] = []
  for (let i = 0; i < count; i++) {
    const flags = cursor.u8()
    const tag = (flags & 0x3f) === 0x3f ? cursor.tag() : (WOFF2_TAGS[flags & 0x3f] ?? '')
    const length = cursor.base128()
    const version = flags >> 6
    // glyf and loca are transformed unless version 3; other tables only if not version 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0
    entries.push({ tag, length: transformed ? cursor.base128() : length })
  }
  let fontCount = 1
  if (flavor === COLLECTION) {
    cursor.u32()
    fontCount = cursor.u255()
    for (let font = 0; font < fontCount; font++) {
      const tables = cursor.u255()
      cursor.u32()
      for (let i = 0; i < tables; i++) cursor.u255()
    }
  }
  const total = entries.reduce((sum, entry) => sum + entry.length, 0)
  const { decompress } = await import('brotli/decompress')
  const compressed = new Uint8Array(view.buffer, view.byteOffset + cursor.offset, compressedSize)
  const data = decompress(compressed, total)
  const stream = new DataView(data.buffer, data.byteOffset, data.byteLength)
  // The tables follow each other in the decompressed data, in directory order. In a
  // collection, the first copy of each tag is taken as the first font's.
  const tables = new Map<string, DataView>()
  let offset = 0
  for (const { tag, length } of entries) {
    if (WANTED.includes(tag) && !tables.has(tag)) tables.set(tag, slice(stream, offset, length))
    offset += length
  }
  return { container: 'woff2', fontCount, tags: entries.map((entry) => entry.tag), tables }
}

async function readTables(view: DataView): Promise<Tables> {
  if (view.byteLength < 12) throw new FontFileError('This file is too short to be a font.')
  const signature = view.getUint32(0)
  if (signature === SFNT_TRUETYPE || signature === SFNT_APPLE || signature === SFNT_CFF) {
    return { container: 'sfnt', fontCount: 1, ...sfntTables(view, 0) }
  }
  if (signature === COLLECTION) {
    return { container: 'collection', fontCount: view.getUint32(8), ...sfntTables(view, view.getUint32(12)) }
  }
  if (signature === WOFF) return woffTables(view)
  if (signature === WOFF2) return woff2Tables(view)
  throw new FontFileError('This isn’t a font file the preview can read.')
}

// ---------------------------------------------------------------------------------------
// Characters (cmap)

/** How good a cmap subtable is: lower is better; null if it isn't Unicode or can't be read. */
function subtableRank(platform: number, encoding: number, format: number): number | null {
  const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
  if (unicode && (format === 12 || format === 13)) return 0
  if (unicode && format === 4) return 1
  if (unicode && (format === 6 || format === 0)) return 2
  // Symbol fonts: their characters are in the private use area, from U+F020.
  if (platform === 3 && encoding === 0 && (format === 4 || format === 6)) return 3
  return null
}

function readCmap(cmap: DataView): { codePoints: Uint32Array; glyphIds: Uint32Array } {
  let best: { rank: number; offset: number } | null = null
  const count = cmap.getUint16(2)
  for (let i = 0; i < count; i++) {
    const offset = cmap.getUint32(8 + i * 8)
    const rank = subtableRank(cmap.getUint16(4 + i * 8), cmap.getUint16(6 + i * 8), cmap.getUint16(offset))
    if (rank !== null && (!best || rank < best.rank)) best = { rank, offset }
  }
  const codePoints: number[] = []
  const glyphIds: number[] = []
  // Each code point a subtable claims costs one, whether or not it has a glyph.
  let budget = MAX_CODE_POINTS * 2
  const add = (codePoint: number, glyph: number) => {
    budget--
    if (glyph === 0 || codePoints.length >= MAX_CODE_POINTS) return
    codePoints.push(codePoint)
    glyphIds.push(glyph)
  }
  if (best) {
    const at = best.offset
    const format = cmap.getUint16(at)
    if (format === 4) {
      const segments = cmap.getUint16(at + 6) / 2
      const ends = at + 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const rangeOffsets = deltas + segments * 2
      for (let i = 0; i < segments; i++) {
        const start = cmap.getUint16(starts + i * 2)
        const end = cmap.getUint16(ends + i * 2)
        const delta = cmap.getUint16(deltas + i * 2)
        const rangeOffset = cmap.getUint16(rangeOffsets + i * 2)
        for (let codePoint = start; codePoint <= end && codePoint !== 0xffff; codePoint++) {
          let glyph = codePoint
          if (rangeOffset !== 0) {
            glyph = cmap.getUint16(rangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2)
            if (glyph === 0) continue
          }
          add(codePoint, (glyph + delta) & 0xffff)
        }
      }
    } else if (format === 12 || format === 13) {
      const groups = cmap.getUint32(at + 12)
      for (let i = 0; i < groups && budget > 0; i++) {
        const group = at + 16 + i * 12
        const start = cmap.getUint32(group)
        const end = Math.min(cmap.getUint32(group + 4), 0x10ffff)
        const glyph = cmap.getUint32(group + 8)
        for (let codePoint = start; codePoint <= end && budget > 0; codePoint++) {
          add(codePoint, format === 12 ? glyph + codePoint - start : glyph)
        }
      }
    } else if (format === 6) {
      const first = cmap.getUint16(at + 6)
      const entries = cmap.getUint16(at + 8)
      for (let i = 0; i < entries; i++) add(first + i, cmap.getUint16(at + 10 + i * 2))
    } else {
      for (let i = 0; i < 256; i++) add(i, cmap.getUint8(at + 6 + i))
    }
  }
  return sortByCodePoint(codePoints, glyphIds)
}

/** Subtables are meant to be in order already; this copes with ones that aren't. */
function sortByCodePoint(codePoints: number[], glyphIds: number[]) {
  const sorted = codePoints.every((codePoint, i) => i === 0 || codePoint > (codePoints[i - 1] ?? 0))
  if (sorted) return { codePoints: Uint32Array.from(codePoints), glyphIds: Uint32Array.from(glyphIds) }
  const order = codePoints.map((_, i) => i).sort((a, b) => (codePoints[a] ?? 0) - (codePoints[b] ?? 0))
  const unique = order.filter((index, i) => i === 0 || codePoints[index] !== codePoints[order[i - 1] ?? 0])
  return {
    codePoints: Uint32Array.from(unique, (index) => codePoints[index] ?? 0),
    glyphIds: Uint32Array.from(unique, (index) => glyphIds[index] ?? 0),
  }
}

// ---------------------------------------------------------------------------------------
// Names, glyph names, axes

function decodeName(platform: number, encoding: number, bytes: Uint8Array): string | null {
  if (platform === 0 || platform === 3) return new TextDecoder('utf-16be').decode(bytes)
  if (platform === 1 && encoding === 0) {
    try {
      return new TextDecoder('macintosh').decode(bytes)
    } catch {
      // Without Mac Roman (it needs ICU), ASCII names still come out right.
      return new TextDecoder('windows-1252').decode(bytes)
    }
  }
  return null
}

/** Reads one name by ID, preferring Windows US English, as most apps do. */
function nameReader(name: DataView | undefined): (id: number) => string | null {
  if (!name) return () => null
  const count = name.getUint16(2)
  const strings = name.getUint16(4)
  const best = new Map<number, { score: number; text: string }>()
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12
    const platform = name.getUint16(record)
    const encoding = name.getUint16(record + 2)
    const language = name.getUint16(record + 4)
    const id = name.getUint16(record + 6)
    const score =
      platform === 3 ? (language === 0x409 ? 0 : (language & 0xff) === 0x09 ? 1 : 2) : platform === 0 ? 3 : platform === 1 && language === 0 ? 4 : 5
    const current = best.get(id)
    if (score === 5 || (current && current.score <= score)) continue
    const offset = strings + name.getUint16(record + 10)
    const length = name.getUint16(record + 8)
    if (offset + length > name.byteLength) continue
    const text = decodeName(platform, encoding, new Uint8Array(name.buffer, name.byteOffset + offset, length))
    if (text?.trim()) best.set(id, { score, text: text.trim() })
  }
  return (id) => best.get(id)?.text ?? null
}

/** Names of glyphs from version 2 post tables; Macintosh standard names (Latin letters…) are left out. */
function readGlyphNames(post: DataView | undefined): Map<number, string> {
  const names = new Map<number, string>()
  if (!post || post.byteLength < 34 || post.getUint32(0) !== 0x00020000) return names
  const glyphs = post.getUint16(32)
  const strings: string[] = []
  let offset = 34 + glyphs * 2
  while (offset < post.byteLength) {
    const length = post.getUint8(offset)
    strings.push(String.fromCharCode(...new Uint8Array(post.buffer, post.byteOffset + offset + 1, length)))
    offset += 1 + length
  }
  for (let glyph = 0; glyph < glyphs; glyph++) {
    const index = post.getUint16(34 + glyph * 2)
    const name = index >= 258 ? strings[index - 258] : undefined
    if (name) names.set(glyph, name)
  }
  return names
}

const AXIS_NAMES: Record<string, string> = {
  wght: 'Weight',
  wdth: 'Width',
  slnt: 'Slant',
  ital: 'Italic',
  opsz: 'Optical size',
}

function readAxes(fvar: DataView | undefined, nameOf: (id: number) => string | null): FontAxis[] {
  if (!fvar) return []
  const start = fvar.getUint16(4)
  const count = fvar.getUint16(8)
  const size = fvar.getUint16(10)
  const axes: FontAxis[] = []
  for (let i = 0; i < count; i++) {
    const record = start + i * size
    const tag = tagAt(fvar, record)
    if (fvar.getUint16(record + 16) & 0x0001) continue // hidden
    axes.push({
      tag,
      name: AXIS_NAMES[tag] ?? nameOf(fvar.getUint16(record + 18)) ?? tag.trim(),
      min: fvar.getInt32(record + 4) / 65536,
      default: fvar.getInt32(record + 8) / 65536,
      max: fvar.getInt32(record + 12) / 65536,
    })
  }
  return axes
}

function outlinesOf(tags: string[]): FontInfo['outlines'] {
  if (tags.includes('glyf')) return 'TrueType'
  if (tags.includes('CFF ')) return 'CFF'
  if (tags.includes('CFF2')) return 'CFF2'
  if (tags.some((tag) => ['CBDT', 'sbix', 'EBDT'].includes(tag))) return 'bitmap'
  return null
}

export async function readFontInfo(bytes: Uint8Array): Promise<FontInfo> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const { container, fontCount, tags, tables } = await readTables(view)
  const nameOf = nameReader(tables.get('name'))
  const cmap = tables.get('cmap')
  const maxp = tables.get('maxp')
  return {
    container,
    fontCount,
    outlines: outlinesOf(tags),
    // Typographic names (16, 17) when there are any: they group weights into one family.
    family: nameOf(16) ?? nameOf(1),
    style: nameOf(17) ?? nameOf(2),
    version: nameOf(5),
    copyright: nameOf(0),
    glyphCount: maxp ? maxp.getUint16(4) : null,
    ...(cmap ? readCmap(cmap) : { codePoints: new Uint32Array(), glyphIds: new Uint32Array() }),
    glyphNames: readGlyphNames(tables.get('post')),
    axes: readAxes(tables.get('fvar'), nameOf),
    colourTables: COLOUR_TABLES.filter((tag) => tags.includes(tag)).map((tag) => tag.trim()),
  }
}

// ---------------------------------------------------------------------------------------
// Questions the preview asks

/** The index of the first code point at or after `codePoint`. */
function lowerBound(codePoints: Uint32Array, codePoint: number): number {
  let low = 0
  let high = codePoints.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((codePoints[middle] ?? 0) < codePoint) low = middle + 1
    else high = middle
  }
  return low
}

export function hasCharacter(info: Pick<FontInfo, 'codePoints'>, codePoint: number): boolean {
  return info.codePoints[lowerBound(info.codePoints, codePoint)] === codePoint
}

/** The private use area: the BMP's, and planes 15 and 16. */
export const PRIVATE_USE_RANGES: readonly (readonly [number, number])[] = [
  [0xe000, 0xf8ff],
  [0xf0000, 0xffffd],
  [0x100000, 0x10fffd],
]

export interface PrivateUseCharacter {
  codePoint: number
  /** The glyph's name, when the font has one. */
  name: string | undefined
}

export function privateUseCharacters(info: FontInfo): PrivateUseCharacter[] {
  const found: PrivateUseCharacter[] = []
  for (const [start, end] of PRIVATE_USE_RANGES) {
    for (let i = lowerBound(info.codePoints, start); i < info.codePoints.length; i++) {
      const codePoint = info.codePoints[i] ?? 0
      if (codePoint > end) break
      found.push({ codePoint, name: info.glyphNames.get(info.glyphIds[i] ?? 0) })
    }
  }
  return found
}

/** "U+E000". */
export function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
}
