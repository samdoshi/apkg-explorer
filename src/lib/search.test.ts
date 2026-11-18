import { describe, expect, it } from 'vitest'
import { normalizeForSearch, searchWords } from './search'

describe('normalizeForSearch', () => {
  it('ignores case and Latin accents', () => {
    expect(normalizeForSearch('Größte Stadt ÖSTERREICHS')).toBe('großte stadt osterreichs')
    expect(normalizeForSearch('Crème Brûlée')).toBe('creme brulee')
  })

  it('keeps Japanese voicing marks', () => {
    expect(normalizeForSearch('がぎぐ')).toBe('がぎぐ')
    expect(normalizeForSearch('が')).not.toBe(normalizeForSearch('か'))
    // A decomposed が (か + combining voicing mark) matches a composed one.
    expect(normalizeForSearch(`か${String.fromCodePoint(0x3099)}`)).toBe('が')
  })
})

describe('searchWords', () => {
  it('splits on whitespace and normalises each word', () => {
    expect(searchWords('  Tokyo  JAPÓN ')).toEqual(['tokyo', 'japon'])
    expect(searchWords('   ')).toEqual([])
  })
})
