import { describe, expect, it } from 'vitest'
import { coverage, FONT_SAMPLES } from './font-samples'

/** A font with only basic Latin letters, digits and punctuation. */
const asciiOnly = (codePoint: number) => codePoint >= 0x21 && codePoint <= 0x7e

describe('coverage', () => {
  it('splits text into runs the font has and runs it lacks, listing what it lacks once', () => {
    expect(coverage('Préfère été', asciiOnly)).toEqual({
      runs: [
        { text: 'Pr', missing: false },
        { text: 'é', missing: true },
        { text: 'f', missing: false },
        { text: 'è', missing: true },
        { text: 're ', missing: false },
        { text: 'é', missing: true },
        { text: 't', missing: false },
        { text: 'é', missing: true },
      ],
      missing: ['é', 'è'],
      hasAny: true,
    })
  })

  it('treats spaces as present, but only letters and digits as having the language', () => {
    const greek = coverage('Ξεσκεπάζω την.', asciiOnly)
    expect(greek.hasAny).toBe(false)
    expect(greek.runs.at(-1)).toEqual({ text: '.', missing: false })
    expect(coverage('私は', () => true)).toMatchObject({ missing: [], hasAny: true })
  })

  it('has a sample for each language, the English one covered by a Latin font', () => {
    expect(new Set(FONT_SAMPLES.map((sample) => sample.language)).size).toBe(FONT_SAMPLES.length)
    const english = FONT_SAMPLES.find((sample) => sample.language === 'English')
    expect(coverage(english?.text ?? '', asciiOnly).missing).toEqual([])
    // Astral characters are checked as whole code points.
    expect(coverage('a\u{F0000}', asciiOnly).missing).toEqual(['\u{F0000}'])
  })
})
