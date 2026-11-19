import { findMath, replaceMath } from './find-math'

type Engine = typeof import('./mathjax-engine')

let engine: Promise<Engine> | null = null

/** MathJax is a separate chunk, loaded the first time a card has maths. */
function loadEngine(): Promise<Engine> {
  engine ??= import('./mathjax-engine').catch((error: unknown) => {
    // Let the next card try again (e.g. after a network blip while the app updates).
    engine = null
    throw error
  })
  return engine
}

export interface TypesetResult {
  /** The HTML with every \( … \) and \[ … \] replaced by MathJax's SVG output. */
  parts: string[]
  /** CSS for the SVG output, or null when there was no maths (and MathJax wasn't loaded). */
  css: string | null
}

/** Typesets the maths in some HTML, as Anki's MathJax would. */
export async function typesetMath(parts: string[]): Promise<TypesetResult> {
  const spans = parts.map(findMath)
  if (spans.every((found) => found.length === 0)) return { parts, css: null }
  const { texToSvg, mathCss } = await loadEngine()
  const typeset = await Promise.all(
    parts.map(async (part, index) => {
      const found = spans[index] ?? []
      const rendered = await Promise.all(found.map((span) => texToSvg(span.tex, span.display)))
      return replaceMath(part, found, rendered)
    }),
  )
  return { parts: typeset, css: mathCss() }
}
