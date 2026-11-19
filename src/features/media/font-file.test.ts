import { openAsBlob } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { brotliCompressSync, deflateSync } from 'node:zlib'
import initSqlJs from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { AnkiPackage } from '@/features/package/package'
import { codePointLabel, hasCharacter, privateUseCharacters, readFontInfo, type FontInfo } from './font-file'

const root = join(import.meta.dirname, '../../..')
let ttf: Uint8Array

// The sample deck's font, made by scripts/make_fixtures.py (pixel_font).
beforeAll(async () => {
  const pkg = await AnkiPackage.open(await openAsBlob(join(root, 'fixtures/sample.apkg')), 'sample.apkg', await initSqlJs())
  const blob = await pkg.readMedia('_pixel.ttf')
  ttf = new Uint8Array(await (blob ?? new Blob()).arrayBuffer())
  pkg.close()
})

// --- Building other containers from the TrueType file ----------------------------------

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const u16 = (value: number) => [value >>> 8, value & 0xff]
const u32 = (value: number) => [...u16(value >>> 16), ...u16(value & 0xffff)]
const ascii = (text: string) => Array.from({ length: text.length }, (_, i) => text.charCodeAt(i))
const pad4 = (data: Uint8Array) => concat([data, new Array<number>(-data.length & 3).fill(0)])

function tablesOf(font: Uint8Array): { tag: string; data: Uint8Array }[] {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  return Array.from({ length: view.getUint16(4) }, (_, i) => {
    const record = 12 + i * 16
    const offset = view.getUint32(record + 8)
    return { tag: String.fromCharCode(...font.subarray(record, record + 4)), data: font.subarray(offset, offset + view.getUint32(record + 12)) }
  })
}

function toWoff(font: Uint8Array): Uint8Array {
  const tables = tablesOf(font).map(({ tag, data }) => {
    const compressed = deflateSync(data)
    return { tag, data, stored: compressed.length < data.length ? new Uint8Array(compressed) : data }
  })
  let offset = 44 + 20 * tables.length
  const directory = tables.map(({ tag, data, stored }) => {
    const entry = [...ascii(tag), ...u32(offset), ...u32(stored.length), ...u32(data.length), ...u32(0)]
    offset += pad4(stored).length
    return entry
  })
  const header = [...ascii('wOFF'), ...u32(0x00010000), ...u32(offset), ...u16(tables.length), ...u16(0), ...u32(font.length), ...u16(1), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0)]
  return concat([header, ...directory, ...tables.map(({ stored }) => pad4(stored))])
}

function base128(value: number): number[] {
  const bytes = [value & 0x7f]
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) bytes.unshift((rest & 0x7f) | 0x80)
  return bytes
}

const KNOWN: Record<string, number> = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, name: 5, 'OS/2': 6, post: 7, glyf: 10, loca: 11 }

/**
 * Like a real WOFF2 file: glyf and loca are marked transformed (glyf's data is left as it
 * is, since only its length matters here, and loca's transformed length is 0), and one
 * table has a tag WOFF2 has no number for.
 */
function toWoff2(font: Uint8Array): Uint8Array {
  const tables = [...tablesOf(font), { tag: 'TEST', data: new Uint8Array([1, 2, 3]) }]
  const directory: number[] = []
  const stream: Uint8Array[] = []
  for (const { tag, data } of tables) {
    const known = KNOWN[tag]
    directory.push(...(known === undefined ? [0x3f, ...ascii(tag)] : [known]), ...base128(data.length))
    if (tag === 'glyf') directory.push(...base128(data.length))
    if (tag === 'loca') directory.push(...base128(0))
    else stream.push(data)
  }
  const compressed = new Uint8Array(brotliCompressSync(concat(stream)))
  const header = [...ascii('wOF2'), ...u32(0x00010000), ...u32(0), ...u16(tables.length), ...u16(0), ...u32(font.length), ...u32(compressed.length), ...u16(1), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0)]
  return concat([header, directory, compressed])
}

/** A collection of two fonts that share the same tables. */
function toCollection(font: Uint8Array): Uint8Array {
  const shifted = font.slice()
  const view = new DataView(shifted.buffer)
  for (let i = 0; i < view.getUint16(4); i++) view.setUint32(12 + i * 16 + 8, view.getUint32(12 + i * 16 + 8) + 20)
  return concat([[...ascii('ttcf'), ...u32(0x00010000), ...u32(2), ...u32(20), ...u32(20)], shifted])
}

// --- Tests ------------------------------------------------------------------------------

function expectSampleFont(info: FontInfo) {
  expect(info).toMatchObject({
    outlines: 'TrueType',
    family: 'Sample Pixel',
    style: 'Regular',
    version: 'Version 1.000',
    glyphCount: 53,
    axes: [],
    colourTables: [],
  })
  expect(info.copyright).toMatch(/^Public domain\./)
  // Space, 45 drawn characters, a-z sharing A-Z's glyphs, and 6 icons.
  expect(info.codePoints).toHaveLength(78)
  expect(['A', 'a', '0', '?'].every((char) => hasCharacter(info, char.codePointAt(0) ?? 0))).toBe(true)
  expect(hasCharacter(info, 'é'.codePointAt(0) ?? 0)).toBe(false)
  expect(privateUseCharacters(info).map(({ codePoint, name }) => `${codePointLabel(codePoint)} ${String(name)}`)).toEqual([
    'U+E000 star',
    'U+E001 heart',
    'U+E002 music',
    'U+E003 check',
    'U+E004 globe',
    'U+F0000 diamond',
  ])
}

describe('readFontInfo', () => {
  it('reads a TrueType font: names, characters (BMP and beyond) and glyph names', async () => {
    const info = await readFontInfo(ttf)
    expect(info).toMatchObject({ container: 'sfnt', fontCount: 1 })
    expectSampleFont(info)
  })

  it('reads the same font from WOFF, WOFF2 and a collection', async () => {
    expect(await readFontInfo(toWoff(ttf))).toMatchObject({ container: 'woff' })
    expectSampleFont(await readFontInfo(toWoff(ttf)))
    expect(await readFontInfo(toWoff2(ttf))).toMatchObject({ container: 'woff2' })
    expectSampleFont(await readFontInfo(toWoff2(ttf)))
    expect(await readFontInfo(toCollection(ttf))).toMatchObject({ container: 'collection', fontCount: 2 })
    expectSampleFont(await readFontInfo(toCollection(ttf)))
  })

  it('reads a real WOFF2 file with PostScript outlines (one of MathJax’s fonts)', async () => {
    const file = await readFile(join(root, 'node_modules/@mathjax/mathjax-newcm-font/chtml/woff2/mjx-ncm-b.woff2'))
    const info = await readFontInfo(new Uint8Array(file))
    expect(info).toMatchObject({ container: 'woff2', outlines: 'CFF', family: 'mjx-ncm-b', style: 'Regular' })
    expect(info.copyright).toContain('MathJax')
    expect(info.codePoints).toHaveLength(127)
    expect(hasCharacter(info, 0x21)).toBe(true)
  })

  it('rejects files that aren’t fonts', async () => {
    await expect(readFontInfo(new TextEncoder().encode('@font-face { src: url(x.ttf) }'))).rejects.toThrow(
      'This isn’t a font file the preview can read.',
    )
  })
})
