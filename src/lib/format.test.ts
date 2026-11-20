import { describe, expect, it } from 'vitest'
import { compareText, formatBytes, formatCount, formatNumber } from './format'

describe('formatCount', () => {
  it('pluralises and groups digits', () => {
    expect(formatCount(1, 'note')).toBe('1 note')
    expect(formatCount(12345, 'card')).toBe('12,345 cards')
    expect(formatCount(2, 'media file')).toBe('2 media files')
  })
})

describe('formatNumber', () => {
  it('groups digits the English way, whatever the browser language', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
})

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(187_140)).toBe('183 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3.5 * 1024 ** 3)).toBe('3.5 GB')
  })
})

describe('compareText', () => {
  it('sorts numbers by value, ignoring case and accents', () => {
    expect(['Lesson 10', 'lesson 2', 'Lesson 1'].sort(compareText)).toEqual(['Lesson 1', 'lesson 2', 'Lesson 10'])
    expect(compareText('Éclair', 'eclair')).toBe(0)
  })
})
