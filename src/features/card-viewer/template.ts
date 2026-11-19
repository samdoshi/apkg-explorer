import { clozeNumbers, clozeOnly, revealCloze, stripHtmlInsideMathjax } from './cloze'
import { escapeHtml } from './escape'
import { fieldIsEmpty, furigana, hint, kana, kanji, stripHtml } from './template-filters'

/*
 * Anki's card template language, following rslib/src/template.rs: {{Field}},
 * {{filter:Field}}, {{#Field}}…{{/Field}}, {{^Field}}…{{/Field}} and {{FrontSide}}.
 * Type-answer filters leave [[type:…]] placeholders for card-html.ts to fill in per side,
 * as Anki's reviewer does.
 */

type TemplateNode =
  | { type: 'text'; text: string }
  | { type: 'replacement'; key: string; filters: string[]; raw: string }
  | { type: 'conditional'; key: string; negated: boolean; children: TemplateNode[] }

type Token =
  | { type: 'text'; text: string }
  | { type: 'replacement'; key: string; filters: string[]; raw: string }
  | { type: 'open'; key: string; negated: boolean }
  | { type: 'close'; key: string; raw: string }

export class TemplateError extends Error {}

/** Very old templates could switch to <% %> delimiters with this at the start. */
const ALT_DELIMITERS = '{{=<% %>=}}'

function tokenize(template: string): Token[] {
  let text = template
  let open = '{{'
  let close = '}}'
  const trimmed = template.trimStart()
  if (trimmed.startsWith(ALT_DELIMITERS)) {
    text = trimmed.slice(ALT_DELIMITERS.length)
    open = '<%'
    close = '%>'
  }
  const tokens: Token[] = []
  let position = 0
  while (position < text.length) {
    const start = text.indexOf(open, position)
    if (start < 0) {
      tokens.push({ type: 'text', text: text.slice(position) })
      break
    }
    if (start > position) tokens.push({ type: 'text', text: text.slice(position, start) })
    const end = text.indexOf(close, start + open.length)
    if (end < 0) {
      throw new TemplateError(`Missing '${close}' in '${text.slice(start, start + 40)}'`)
    }
    tokens.push(classify(text.slice(start + open.length, end)))
    position = end + close.length
  }
  return tokens
}

function classify(inner: string): Token {
  const content = inner.replace(/^\{+/, '').trim()
  const raw = `{{${content}}}`
  if (content.length >= 2) {
    const key = content.slice(1).trim()
    if (content.startsWith('#')) return { type: 'open', key, negated: false }
    if (content.startsWith('^')) return { type: 'open', key, negated: true }
    if (content.startsWith('/')) return { type: 'close', key, raw }
  }
  // {{outer:inner:Field}} applies "inner" first.
  const parts = content.split(':').map((part) => part.trim())
  const key = parts.pop() ?? ''
  return { type: 'replacement', key, filters: parts.reverse(), raw }
}

function parse(template: string): TemplateNode[] {
  const root: TemplateNode[] = []
  const open: { key: string; parent: TemplateNode[] }[] = []
  let current = root
  for (const token of tokenize(template)) {
    if (token.type === 'text' || token.type === 'replacement') {
      current.push(token)
    } else if (token.type === 'open') {
      const node: TemplateNode = { type: 'conditional', key: token.key, negated: token.negated, children: [] }
      current.push(node)
      open.push({ key: token.key, parent: current })
      current = node.children
    } else {
      const opened = open.pop()
      if (!opened) {
        throw new TemplateError(
          `Found '${token.raw}', but missing '{{#${token.key}}}' or '{{^${token.key}}}'`,
        )
      }
      if (opened.key !== token.key) {
        throw new TemplateError(`Found '${token.raw}', but expected '{{/${opened.key}}}'`)
      }
      current = opened.parent
    }
  }
  const unclosed = open.at(-1)
  if (unclosed) throw new TemplateError(`Missing '{{/${unclosed.key}}}'`)
  return root
}

export interface TemplateContext {
  /** Field values by name, including the special fields (see buildFieldMap). */
  fields: ReadonlyMap<string, string>
  /** The card's number: template index + 1, which is also its cloze number. */
  cardNumber: number
  question: boolean
  /** The rendered question, inserted by {{FrontSide}} on the answer side. */
  frontSide: string
}

function renderNodes(nodes: TemplateNode[], context: TemplateContext): string {
  let html = ''
  for (const node of nodes) {
    if (node.type === 'text') {
      html += node.text
    } else if (node.type === 'conditional') {
      const filled = !fieldIsEmpty(context.fields.get(node.key) ?? '')
      if (filled !== node.negated) html += renderNodes(node.children, context)
    } else if (node.key === 'FrontSide') {
      if (!context.question) html += context.frontSide
    } else {
      // {{tts-voices:}} and the like have filters but no field.
      const value = node.key === '' && node.filters.length > 0 ? '' : context.fields.get(node.key)
      if (value === undefined) {
        throw new TemplateError(`Found '${node.raw}', but there is no field called '${node.key}'`)
      }
      html += applyFilters(value, node.filters, node.key, context)
    }
  }
  return html
}

function applyFilters(
  text: string,
  filters: string[],
  fieldName: string,
  context: TemplateContext,
): string {
  // {{type:cloze:Field}} and {{type:nc:Field}} are single filters in Anki.
  const joined = filters.join(':')
  if (joined === 'cloze:type') return `[[type:cloze:${fieldName}]]`
  if (joined === 'nc:type') return `[[type:nc:${fieldName}]]`
  let result = text
  for (const filter of filters) {
    // "tts en_US voices=…" is the tts filter with options.
    switch (filter.split(' ')[0]) {
      case 'text':
        result = stripHtml(result)
        break
      case 'furigana':
        result = furigana(result)
        break
      case 'kana':
        result = kana(result)
        break
      case 'kanji':
        result = kanji(result)
        break
      case 'hint':
        result = hint(result, fieldName)
        break
      case 'cloze':
        result = stripHtmlInsideMathjax(revealCloze(result, context.cardNumber, context.question))
        break
      case 'cloze-only':
        result = clozeOnly(result, context.cardNumber, context.question)
        break
      case 'type':
        result = `[[type:${fieldName}]]`
        break
      case 'tts-voices':
        result = ''
        break
      // tts: shown as text (nothing is spoken). Unknown filters: passed through.
    }
  }
  return result
}

/** True if no field this template would show has any content (Anki's "blank front"). */
function rendersNoFields(nodes: TemplateNode[], fields: ReadonlyMap<string, string>): boolean {
  const filled = (key: string) => !fieldIsEmpty(fields.get(key) ?? '')
  return nodes.every((node) => {
    if (node.type === 'text') return true
    if (node.type === 'replacement') return !filled(node.key)
    if (!node.negated && !filled(node.key)) return true
    return rendersNoFields(node.children, fields)
  })
}

export interface CardTemplateInput {
  front: string
  back: string
  fields: ReadonlyMap<string, string>
  /** Template index; for cloze note types, the cloze number minus one. */
  ord: number
  isCloze: boolean
}

export interface RenderedSides {
  question: string
  answer: string
}

function problem(message: string): string {
  return `<div class="apkg-template-problem">${message}</div>`
}

function renderSide(
  side: 'Front' | 'Back',
  template: string,
  context: TemplateContext,
  check?: (nodes: TemplateNode[]) => string | null,
): string {
  try {
    const nodes = parse(template)
    // Render first, so a missing field is reported before a blank front.
    const html = renderNodes(nodes, context)
    return check?.(nodes) ?? html
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error
    return problem(`<p><b>${side} template has a problem:</b></p><p>${escapeHtml(error.message)}</p>`)
  }
}

/** Renders both sides of one card. Template mistakes become a message, as in Anki. */
export function renderCard({ front, back, fields, ord, isCloze }: CardTemplateInput): RenderedSides {
  const cardNumber = ord + 1
  const question = renderSide('Front', front, { fields, cardNumber, question: true, frontSide: '' }, (nodes) => {
    if (isCloze) {
      const hasCloze = [...fields.values()].some((value) => clozeNumbers(value).has(cardNumber))
      return hasCloze ? null : problem(`<p>No cloze ${String(cardNumber)} found on card.</p>`)
    }
    return rendersNoFields(nodes, fields) ? problem('<p>The front of this card is blank.</p>') : null
  })
  const answer = renderSide('Back', back, { fields, cardNumber, question: false, frontSide: question })
  return { question, answer }
}

export interface FieldMapInput {
  fieldNames: readonly string[]
  fieldValues: readonly string[]
  tags: readonly string[]
  noteTypeName: string
  deckName: string
  templateName: string
  flag: number
  cardId: number
  ord: number
}

/** A note's fields by name, plus Anki's special fields (real fields win on a clash). */
export function buildFieldMap(input: FieldMapInput): Map<string, string> {
  const fields = new Map<string, string>()
  input.fieldNames.forEach((name, index) => fields.set(name, input.fieldValues[index] ?? ''))
  const special: [string, string][] = [
    ['Tags', input.tags.join(' ').trim()],
    ['Type', input.noteTypeName],
    ['Deck', input.deckName],
    ['Subdeck', input.deckName.split('::').at(-1) ?? ''],
    ['CardFlag', input.flag ? `flag${String(input.flag)}` : ''],
    ['Card', input.templateName],
    ['CardID', String(input.cardId)],
    // {{#c2}}…{{/c2}} shows only on card 2.
    [`c${String(input.ord + 1)}`, '1'],
  ]
  for (const [name, value] of special) if (!fields.has(name)) fields.set(name, value)
  return fields
}
