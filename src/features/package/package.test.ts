import { openAsBlob } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SqlJsStatic } from 'sql.js'
import { AnkiPackage } from './package'

const fixtures = join(import.meta.dirname, '../../../fixtures')
let sql: SqlJsStatic

beforeAll(async () => {
  sql = await initSqlJs()
})

async function open(name: string) {
  const path = join(fixtures, name)
  return AnkiPackage.open(await openAsBlob(path), name, sql)
}

async function bytesOf(blob: Blob | null) {
  expect(blob).not.toBeNull()
  return new Uint8Array(await (blob ?? new Blob()).arrayBuffer())
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

describe('current format (collection.anki21b)', () => {
  it('reads note types, decks and counts from the schema 18 tables', async () => {
    const pkg = await open('sample.apkg')
    const summary = pkg.summary()
    expect(summary.format).toBe('anki21b')
    expect(summary.schemaVersion).toBe(18)
    expect(summary.noteCount).toBe(23)
    expect(summary.cardCount).toBe(36)
    expect(summary.noteTypes.map((t) => [t.name, t.noteCount, t.cardCount])).toEqual([
      ['Basic', 8, 8],
      ['Basic (and reversed card)', 4, 8],
      ['Basic (type in the answer)', 1, 1],
      ['Cloze', 3, 6],
      ['Country', 6, 12],
      ['Quiz (shuffled options)', 1, 1],
    ])
    const country = summary.noteTypes.find((t) => t.name === 'Country')
    expect(country?.fieldNames).toEqual(['Country', 'Capital', 'Flag', 'Anthem', 'Notes'])
    expect(country?.templateNames).toEqual(['Capital', 'Flag'])
    expect(summary.noteTypes.find((t) => t.name === 'Cloze')?.kind).toBe('cloze')
    // Deck levels are stored with \x1f in schema 18 and shown with "::".
    expect(summary.decks.map((d) => [d.name, d.cardCount])).toEqual([
      ['Sample::Geography', 14],
      ['Sample::Languages', 10],
      ['Sample::Science', 12],
    ])
    pkg.close()
  })

  it('lists media and decompresses files on demand', async () => {
    const pkg = await open('sample.apkg')
    expect(pkg.summary().mediaCount).toBe(19)
    const flag = pkg.mediaFiles().find((m) => m.name === 'flag-japan.png')
    expect(flag?.size).toBeGreaterThan(100)
    // The media browser's list: names and sizes only.
    const list = pkg.mediaList()
    expect(list).toHaveLength(19)
    expect(list.find((m) => m.name === 'flag-japan.png')).toEqual({ name: 'flag-japan.png', size: flag?.size })

    const png = await pkg.readMedia('flag-japan.png')
    expect(png?.type).toBe('image/png')
    const pngBytes = await bytesOf(png)
    expect([...pngBytes.subarray(0, 4)]).toEqual(PNG_SIGNATURE)
    expect(pngBytes.length).toBe(flag?.size)

    const wav = await bytesOf(await pkg.readMedia('chime-france.wav'))
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    const svg = new TextDecoder().decode(await bytesOf(await pkg.readMedia('_globe.svg')))
    expect(svg).toContain('<svg')
    // The video (a WebM file starts with the EBML magic number).
    const webm = await pkg.readMedia('mandelbrot.webm')
    expect(webm?.type).toBe('video/webm')
    expect([...(await bytesOf(webm)).subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
    // The font (a TrueType file starts with version 1.0).
    const font = await pkg.readMedia('_pixel.ttf')
    expect(font?.type).toBe('font/ttf')
    expect([...(await bytesOf(font)).subarray(0, 4)]).toEqual([0, 1, 0, 0])

    expect(await pkg.readMedia('missing-picture.png')).toBeNull()
    // Percent-encoded names in the HTML find the file too.
    expect((await pkg.readMedia('flag%2Djapan.png'))?.size).toBe(flag?.size)
    pkg.close()
  })

  it('returns one note with its raw fields, cards and note type', async () => {
    const pkg = await open('sample.apkg')
    const summary = pkg.summary()
    const country = summary.noteTypes.find((t) => t.name === 'Country')
    expect(country?.sortFieldIndex).toBe(0)
    const japan = pkg.notes(country?.id ?? 0).find((row) => row.fields[0] === 'Japan')
    const note = pkg.note(japan?.id ?? 0)
    expect(note).toMatchObject({
      noteTypeId: country?.id,
      fields: ['Japan', 'Tokyo', '<img src="flag-japan.png">', '[sound:chime-japan.wav]', ''],
      tags: ['geography', 'asia'],
    })
    expect(note?.cards.map((card) => [card.ord, card.deckName])).toEqual([
      [0, 'Sample::Geography'],
      [1, 'Sample::Geography'],
    ])
    // The fixture gives Japan's first card some review history; the second is new.
    expect(note?.cards[0]).toMatchObject({ type: 2, queue: 2, interval: 15, factor: 2500, reps: 5, lapses: 1 })
    expect(note?.cards[1]).toMatchObject({ type: 0, queue: 0, reps: 0 })
    expect(summary.collectionCreated).toBeLessThan(japan?.created ?? 0)
    expect(pkg.note(1)).toBeNull()

    const noteType = pkg.noteType(country?.id ?? 0)
    expect(noteType?.fields.map((field) => field.name)).toEqual(country?.fieldNames)
    expect(noteType?.templates.map((template) => template.name)).toEqual(['Capital', 'Flag'])
    expect(noteType?.templates[0]?.front).toContain('{{Country}}')
    expect(noteType?.css).toContain('_waves.svg')
    expect(pkg.noteType(1)).toBeNull()
    pkg.close()
  })

  it('returns table rows for one note type', async () => {
    const pkg = await open('sample.apkg')
    const country = pkg.summary().noteTypes.find((t) => t.name === 'Country')
    const rows = pkg.notes(country?.id ?? 0)
    expect(rows).toHaveLength(6)
    const japan = rows.find((row) => row.fields[0] === 'Japan')
    expect(japan).toMatchObject({
      fields: ['Japan', 'Tokyo', '', '', ''],
      media: {
        2: [{ kind: 'image', name: 'flag-japan.png' }],
        3: [{ kind: 'audio', name: 'chime-japan.wav' }],
      },
      tags: ['geography', 'asia'],
      decks: ['Sample::Geography'],
      cardCount: 2,
    })
    expect(japan?.search).toContain('tokyo')
    expect(japan?.search).toContain('sample::geography')
    expect(japan?.created).toBeGreaterThan(Date.UTC(2024, 0, 1))
    expect(japan?.modified).toBeGreaterThan(Date.UTC(2024, 0, 1))
    // HTML and entities become plain text.
    const basic = pkg.summary().noteTypes.find((t) => t.name === 'Basic')
    const texts = pkg.notes(basic?.id ?? 0).map((row) => row.fields.join(' | '))
    expect(texts).toContain('What is the chemical symbol for gold? | Au (from Latin aurum)')
    expect(texts).toContain('Speed of light in a vacuum? | 299 792 458 m/s')
    pkg.close()
  })

  it('reads a .colpkg collection package the same way', async () => {
    const pkg = await open('collection.colpkg')
    expect(pkg.summary()).toMatchObject({ format: 'anki21b', noteCount: 3, mediaCount: 1 })
    pkg.close()
  })
})

describe('legacy formats', () => {
  it('reads collection.anki2 with a JSON media map', async () => {
    const pkg = await open('legacy-anki2.apkg')
    const summary = pkg.summary()
    expect(summary).toMatchObject({ format: 'anki2', schemaVersion: 11, noteCount: 4, cardCount: 5 })
    expect(summary.noteTypes.map((t) => [t.name, t.kind, t.fieldNames])).toEqual([
      ['Basic', 'normal', ['Front', 'Back']],
      ['Cloze', 'cloze', ['Text', 'Back Extra']],
    ])
    expect(summary.decks.map((d) => d.name)).toEqual(['Legacy', 'Legacy::Deutsch'])
    const png = await pkg.readMedia('flag-france.png')
    expect([...(await bytesOf(png)).subarray(0, 4)]).toEqual(PNG_SIGNATURE)
    expect(pkg.mediaFiles().find((m) => m.name === 'flag-france.png')?.size).toBe(png?.size)
    pkg.close()
  })

  it('prefers collection.anki21 over the stub anki2 and opens a WAL-mode database', async () => {
    const pkg = await open('legacy-anki21.apkg')
    const summary = pkg.summary()
    expect(summary).toMatchObject({ format: 'anki21', noteCount: 3, cardCount: 5 })
    expect(summary.noteTypes.map((t) => t.name)).toEqual(['Basic', 'Basic (and reversed card)'])
    pkg.close()
  })
})

describe('invalid files', () => {
  it.each([
    ['not-a-zip.apkg', 'not-zip'],
    ['no-collection.apkg', 'no-collection'],
    ['future-version.apkg', 'newer-version'],
    ['corrupt-collection.apkg', 'corrupt'],
  ])('rejects %s with code %s', async (name, code) => {
    await expect(open(join('invalid', name))).rejects.toMatchObject({ code })
  })
})

// Real exports dropped into fixtures/real/ (git-ignored) are checked when present.
const realFiles = (await readdir(join(fixtures, 'real'))).filter((name) =>
  /\.(apkg|colpkg)$/i.test(name),
)

describe.skipIf(realFiles.length === 0)('real packages in fixtures/real', () => {
  it.each(realFiles)('opens %s', async (name) => {
    const pkg = await open(join('real', name))
    const summary = pkg.summary()
    expect(summary.noteTypes.length).toBeGreaterThan(0)
    const notes = summary.noteTypes.reduce((sum, t) => sum + t.noteCount, 0)
    expect(notes).toBe(summary.noteCount)
    for (const noteType of summary.noteTypes) {
      expect(noteType.fieldNames.length).toBeGreaterThan(0)
      expect(noteType.templateNames.length).toBeGreaterThan(0)
    }
    const biggest = summary.noteTypes.reduce((a, b) => (b.noteCount > a.noteCount ? b : a))
    const rows = pkg.notes(biggest.id)
    expect(rows).toHaveLength(biggest.noteCount)
    expect(rows.every((row) => row.fields.length >= biggest.fieldNames.length)).toBe(true)
    // Read a spread of up to 20 media files; each must match the size in the media list.
    const media = pkg.mediaFiles()
    const step = Math.max(1, Math.ceil(media.length / 20))
    for (const file of media.filter((_, index) => index % step === 0)) {
      const blob = await pkg.readMedia(file.name)
      expect(blob, file.name).not.toBeNull()
      if (file.size !== null) expect(blob?.size, file.name).toBe(file.size)
    }
    pkg.close()
  })
})
