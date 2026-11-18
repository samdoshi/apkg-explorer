import { describe, expect, it } from 'vitest'
import { formatBytes, formatCount } from './format'

describe('formatCount', () => {
  it('pluralises and groups digits', () => {
    expect(formatCount(1, 'note')).toBe('1 note')
    expect(formatCount(12345, 'card')).toBe('12,345 cards')
    expect(formatCount(2, 'media file')).toBe('2 media files')
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
