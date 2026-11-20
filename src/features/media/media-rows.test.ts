import { describe, expect, it } from 'vitest'
import {
  buildMediaRows,
  countKinds,
  countUsage,
  extensionLabel,
  filterMediaRows,
  isKindFilter,
  isUsageFilter,
  matchesUsage,
  mediaPath,
  totalSize,
  type UsageFilter,
} from './media-rows'

const used = { missing: false, noteCount: 1, usedElsewhere: false }
const rows = buildMediaRows([
  { name: 'flag-10.png', size: 300, ...used },
  { name: 'chime-france.wav', size: 2000, ...used },
  { name: 'Café.mp3', size: null, ...used },
  { name: 'flag-9.png', size: 200, ...used },
  { name: '_shuffle.js', size: 50, ...used, noteCount: 0, usedElsewhere: true },
  { name: 'clip.webm', size: 9000, ...used },
  { name: '_Kanji.TTF', size: 400, ...used },
])

describe('media rows', () => {
  it('sorts by name, numbers in order, and works out each kind', () => {
    expect(rows.map((row) => [row.name, row.kind])).toEqual([
      ['_Kanji.TTF', 'font'],
      ['_shuffle.js', 'other'],
      ['Café.mp3', 'audio'],
      ['chime-france.wav', 'audio'],
      ['clip.webm', 'video'],
      ['flag-9.png', 'image'],
      ['flag-10.png', 'image'],
    ])
    expect(countKinds(rows)).toEqual({ image: 2, audio: 2, video: 1, font: 1, other: 1 })
    expect(totalSize(rows)).toBe(11950)
  })

  it('filters by kind and by every word of the search, ignoring case and accents', () => {
    const names = (kind: Parameters<typeof filterMediaRows>[2], query = '') =>
      filterMediaRows(rows, query, kind).map((row) => row.name)
    expect(names('image')).toEqual(['flag-9.png', 'flag-10.png'])
    expect(names('all', 'cafe')).toEqual(['Café.mp3'])
    expect(names('audio', 'FRANCE wav')).toEqual(['chime-france.wav'])
    expect(names('image', 'wav')).toEqual([])
    expect(names('all', '  ')).toHaveLength(7)
    expect(names('font')).toEqual(['_Kanji.TTF'])
  })

  it('sorts files into used, unused and missing', () => {
    const files = buildMediaRows([
      { name: 'a.png', size: 1, missing: false, noteCount: 2, usedElsewhere: false },
      { name: '_b.css', size: 1, missing: false, noteCount: 0, usedElsewhere: true },
      { name: 'c.png', size: 1, missing: false, noteCount: 0, usedElsewhere: false },
      { name: 'd.png', size: null, missing: true, noteCount: 1, usedElsewhere: false },
    ])
    expect(countUsage(files)).toEqual({ used: 2, unused: 1, missing: 1 })
    const names = (usage: UsageFilter) => files.filter((row) => matchesUsage(row, usage)).map((row) => row.name)
    expect(names('any')).toEqual(['_b.css', 'a.png', 'c.png'])
    expect(names('used')).toEqual(['_b.css', 'a.png'])
    expect(names('unused')).toEqual(['c.png'])
    expect(names('missing')).toEqual(['d.png'])
    expect(['any', 'missing', 'all', ''].map(isUsageFilter)).toEqual([true, true, false, false])
  })

  it('checks kind filter values, labels extensions and encodes preview routes', () => {
    expect(['all', 'video', 'font', 'fonts', ''].map(isKindFilter)).toEqual([true, true, true, false, false])
    expect(['a.png', 'archive.tar.gz', 'README', '.hidden', 'dot.'].map(extensionLabel)).toEqual([
      'PNG',
      'GZ',
      'No extension',
      'No extension',
      'No extension',
    ])
    expect(mediaPath('image 2.webp')).toBe('/media/image%202.webp')
    expect(mediaPath('100%#?.png')).toBe('/media/100%25%23%3F.png')
  })
})
