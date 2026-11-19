import { escapeHtml } from './escape'

/*
 * Cloze deletions, following Anki's rslib/src/cloze.rs: `{{c1::text}}`, `{{c1::text::hint}}`,
 * clozes nested inside other clozes, and `{{c1,2::text}}` (one deletion on several cards).
 *
 * Like Anki, the parser tracks MathJax (\( … \) and \[ … \]): inside an expression, `}}`
 * only closes a cloze opened in that same expression, so TeX such as `x^{2}}` can't end a
 * cloze early. An opening delimiter with no closing one is ordinary text.
 */

interface Cloze {
  ordinals: number[]
  nodes: ClozeNode[]
  hint: string | null
  /** The opening marker as written, for clozes that are never closed. */
  opening: string
}

type ClozeNode = string | Cloze

/** Anki stops nesting at this depth. */
const MAX_DEPTH = 10
const OPEN = /\{\{c([\d,]+)::/y
const MATH_DELIMITERS: [string, string][] = [
  ['\\(', '\\)'],
  ['\\[', '\\]'],
]

export function parseClozes(text: string): ClozeNode[] {
  const output: ClozeNode[] = []
  const stack: Cloze[] = []
  const addNode = (node: ClozeNode) => {
    const parent = stack.at(-1)
    if (parent) parent.nodes.push(node)
    else output.push(node)
  }
  const addText = (value: string) => {
    if (!value) return
    const cloze = stack.at(-1)
    const split = cloze ? value.indexOf('::') : -1
    if (cloze && split >= 0) {
      cloze.hint = value.slice(split + 2)
      addNode(value.slice(0, split))
    } else {
      addNode(value)
    }
  }

  // The MathJax expression we're in (its closing delimiter and id), and for each open
  // cloze, the expression it was opened in.
  let math: { close: string; id: number } | null = null
  let nextMathId = 0
  const regions: (number | null)[] = []

  let textStart = 0
  let i = 0
  while (i < text.length) {
    OPEN.lastIndex = i
    const open = OPEN.exec(text)
    const ordinals = open ? parseOrdinals(open[1] ?? '') : []
    if (open && ordinals.length > 0 && stack.length < MAX_DEPTH) {
      addText(text.slice(textStart, i))
      stack.push({ ordinals, nodes: [], hint: null, opening: open[0] })
      regions.push(math?.id ?? null)
      i += open[0].length
      textStart = i
      continue
    }
    const canClose = math === null || regions.at(-1) === math.id
    if (canClose && text.startsWith('}}', i)) {
      addText(text.slice(textStart, i))
      const cloze = stack.pop()
      regions.pop()
      if (cloze) addNode(cloze)
      else addNode('}}')
      i += 2
      textStart = i
      continue
    }
    if (math === null) {
      const delimiter = MATH_DELIMITERS.find(
        ([opening, closing]) => text.startsWith(opening, i) && text.includes(closing, i + 2),
      )
      if (delimiter) {
        math = { close: delimiter[1], id: nextMathId++ }
        i += 2
        continue
      }
    } else if (text.startsWith(math.close, i)) {
      math = null
      i += 2
      continue
    }
    i++
  }
  addText(text.slice(textStart))
  // Clozes that are never closed are shown as written.
  while (stack.length > 0) {
    const cloze = stack.pop()
    if (!cloze) break
    const hint = cloze.hint === null ? '' : `::${cloze.hint}`
    addNode(cloze.opening + cloze.nodes.map(rawText).join('') + hint)
  }
  return output
}

/** "1,3,1" → [1, 3]; numbers below 1 aren't cloze numbers. */
function parseOrdinals(list: string): number[] {
  const numbers = list.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(numbers)].sort((a, b) => a - b)
}

function rawText(node: ClozeNode): string {
  if (typeof node === 'string') return node
  const hint = node.hint === null ? '' : `::${node.hint}`
  return `${node.opening}${node.nodes.map(rawText).join('')}${hint}}}`
}

/** The deleted text, with any nested clozes revealed. */
function clozedText(cloze: Cloze): string {
  return cloze.nodes.map((node) => (typeof node === 'string' ? node : clozedText(node))).join('')
}

function hintText(cloze: Cloze): string {
  return cloze.hint === null ? '[...]' : `[${cloze.hint}]`
}

/**
 * The `cloze` filter. `ordinal` is the card's cloze number (1-based). On the question,
 * the active deletion becomes `[...]` (or `[hint]`); on the answer it is revealed. Other
 * deletions are shown as plain text. Returns '' if the text has no deletion for this card,
 * so a template can use several cloze fields.
 */
export function revealCloze(text: string, ordinal: number, question: boolean): string {
  const found = { active: false }
  let html = ''
  const render = (node: ClozeNode) => {
    if (typeof node === 'string') {
      html += node
      return
    }
    const active = node.ordinals.includes(ordinal)
    if (active) found.active = true
    const ordinals = node.ordinals.join(',')
    if (active && question) {
      html += `<span class="cloze" data-cloze="${escapeHtml(clozedText(node))}" data-ordinal="${ordinals}">${hintText(node)}</span>`
      return
    }
    html += `<span class="${active ? 'cloze' : 'cloze-inactive'}" data-ordinal="${ordinals}">`
    node.nodes.forEach(render)
    html += '</span>'
  }
  parseClozes(text).forEach(render)
  return found.active ? html : ''
}

/** The `cloze-only` filter: just this card's deletions (or hints), joined with ", ". */
export function clozeOnly(text: string, ordinal: number, question: boolean): string {
  const parts: string[] = []
  const visit = (node: ClozeNode) => {
    if (typeof node === 'string') return
    if (node.ordinals.includes(ordinal)) parts.push(question ? hintText(node) : clozedText(node))
    node.nodes.forEach(visit)
  }
  parseClozes(text).forEach(visit)
  return parts.join(', ')
}

/** Every cloze number used in the text. */
export function clozeNumbers(text: string): Set<number> {
  const numbers = new Set<number>()
  const visit = (node: ClozeNode) => {
    if (typeof node === 'string') return
    for (const ordinal of node.ordinals) numbers.add(ordinal)
    node.nodes.forEach(visit)
  }
  parseClozes(text).forEach(visit)
  return numbers
}

/** The text with every deletion revealed and no markup, e.g. for a title. */
export function stripClozes(text: string): string {
  return parseClozes(text)
    .map((node) => (typeof node === 'string' ? node : clozedText(node)))
    .join('')
}

const MATHJAX = /(\\[([])([\s\S]*?)(\\[)\]])/g

/**
 * Anki's cloze filter removes HTML inside MathJax after rendering (keeping entities), so
 * cloze markup inside an expression becomes plain TeX: `[...]` on the question.
 */
export function stripHtmlInsideMathjax(text: string): string {
  return text.replace(
    MATHJAX,
    (_match, open: string, inner: string, close: string) =>
      open + inner.replace(/<!--[\s\S]*?-->|<[\s\S]*?>/g, '') + close,
  )
}
