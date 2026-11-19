import { decodeEntities } from '@/features/package/html-text'

/*
 * Finds \( … \) and \[ … \] in card HTML, the way MathJax's FindTeX and HTMLDomStrings
 * would in Anki's reviewer (Anki uses only these two delimiters):
 * - maths can't cross an element, except <br> (a line break in the TeX), <wbr> and comments;
 * - nothing inside <script>, <noscript>, <style>, <textarea>, <pre> or <code> is maths;
 * - the closing delimiter only counts outside braces, and \\ escapes the next character.
 */

export interface MathSpan {
  /** Where the opening delimiter starts and the closing one ends, in the HTML. */
  start: number
  end: number
  /** The TeX between the delimiters, with entities decoded and <br> as a newline. */
  tex: string
  display: boolean
}

const SKIPPED = new Set(['script', 'noscript', 'style', 'textarea', 'pre', 'code'])
/** Elements whose content is raw text: skip straight to the closing tag. */
const RAW_TEXT = new Set(['script', 'style', 'textarea'])
const TAG = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g
const START = /\\\(|\\\[/g

/** A run of text MathJax would search as one string, with each character's place in the HTML. */
interface Run {
  text: string
  at: number[]
}

function textRuns(html: string): Run[] {
  const runs: Run[] = []
  let run: Run = { text: '', at: [] }
  const add = (text: string, from: number) => {
    run.text += text
    for (let i = 0; i < text.length; i++) run.at.push(from + i)
  }
  const breakRun = () => {
    if (run.text) runs.push(run)
    run = { text: '', at: [] }
  }

  const skipped: string[] = []
  let position = 0
  TAG.lastIndex = 0
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    if (skipped.length === 0) add(html.slice(position, match.index), position)
    position = TAG.lastIndex
    const [tag, closing, rawName] = match
    if (rawName === undefined) continue // a comment
    const name = rawName.toLowerCase()
    if (!closing && RAW_TEXT.has(name)) {
      // Script, style and textarea content isn't markup; jump to the end tag.
      const end = html.toLowerCase().indexOf(`</${name}`, position)
      position = end < 0 ? html.length : end
      TAG.lastIndex = position
      breakRun()
      continue
    }
    if (skipped.length === 0 && (name === 'br' || name === 'wbr')) {
      if (name === 'br') add('\n', match.index)
      continue
    }
    breakRun()
    if (SKIPPED.has(name) && !tag.endsWith('/>')) {
      if (!closing) skipped.push(name)
      else if (skipped.at(-1) === name) skipped.pop()
    }
  }
  if (skipped.length === 0) add(html.slice(position), position)
  breakRun()
  return runs
}

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')

/** MathJax's findEnd: the closing delimiter at brace depth 0, skipping escaped characters. */
function findEnd(text: string, from: number, close: string): number {
  const pattern = new RegExp(`${escapeRegExp(close)}|\\\\.|[{}]`, 'g')
  pattern.lastIndex = from
  let braces = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match[0] === close && braces === 0) return match.index
    if (match[0] === '{') braces++
    else if (match[0] === '}' && braces > 0) braces--
  }
  return -1
}

export function findMath(html: string): MathSpan[] {
  if (!html.includes('\\(') && !html.includes('\\[')) return []
  const spans: MathSpan[] = []
  for (const { text, at } of textRuns(html)) {
    START.lastIndex = 0
    for (let start = START.exec(text); start; start = START.exec(text)) {
      const display = start[0] === '\\['
      const from = start.index + 2
      const end = findEnd(text, from, display ? '\\]' : '\\)')
      // No closing delimiter: MathJax leaves the opening one as text and searches on.
      if (end < 0) continue
      spans.push({
        start: at[start.index] ?? 0,
        end: (at[end + 1] ?? 0) + 1,
        tex: decodeEntities(text.slice(from, end)),
        display,
      })
      START.lastIndex = end + 2
    }
  }
  return spans
}

/** Replaces each span with its rendering (spans in the order findMath returns them). */
export function replaceMath(html: string, spans: MathSpan[], rendered: string[]): string {
  let result = ''
  let position = 0
  spans.forEach((span, index) => {
    result += html.slice(position, span.start) + (rendered[index] ?? html.slice(span.start, span.end))
    position = span.end
  })
  return result + html.slice(position)
}
