// Anything other than printable ASCII or whitespace.
const NON_ASCII = /[^ -~\s]/
// U+0300 to U+036F, the Combining Diacritical Marks block used by Latin accents.
const LATIN_COMBINING_MARKS = new RegExp(`[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`, 'g')

/**
 * Lower-cases and strips Latin accents so "Osterreich" finds "Österreich".
 * Only the Combining Diacritical Marks block (U+0300–U+036F) is removed, so Japanese
 * voicing marks survive: が and か stay different.
 */
export function normalizeForSearch(text: string): string {
  const lower = text.toLowerCase()
  // Fast path: pure ASCII needs no Unicode normalisation.
  if (!NON_ASCII.test(lower)) return lower
  return lower.normalize('NFD').replace(LATIN_COMBINING_MARKS, '').normalize('NFC')
}

/** Splits a search box query into normalised words. */
export function searchWords(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean)
}
