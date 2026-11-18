import { mediaKindFor } from './mime'

export interface MediaRef {
  kind: 'image' | 'audio' | 'video'
  name: string
}

export interface FieldText {
  /** Plain text: tags removed, entities decoded, whitespace collapsed. */
  text: string
  /** Media the field refers to, in order. */
  media: MediaRef[]
}

/*
 * Runs in the package worker, which has no DOMParser, so this is a small
 * tolerant converter rather than a full HTML parser. It only produces text for
 * the table and search; cards themselves are rendered from the original HTML.
 */

const DROPPED_ELEMENTS = /<(script|style|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi
const COMMENTS = /<!--[\s\S]*?-->/g
const SOUND_TAG = /\[sound:([^\]]+)\]/g
const MEDIA_ELEMENT = /<(img|audio|video|source)\b([^>]*)>/gi
const SRC_ATTRIBUTE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const BREAKING_TAGS = /<\/?(br|p|div|li|ul|ol|tr|td|th|h[1-6]|hr|blockquote|section|table)\b[^>]*>/gi
const ANY_TAG = /<\/?[a-z!][^>]*>/gi
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ',
  thinsp: ' ', shy: '', zwnj: '', zwj: '', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«',
  raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', middot: '·', copy: '©', reg: '®',
  trade: '™', deg: '°', plusmn: '±', times: '×', divide: '÷', micro: 'µ', para: '¶',
  sect: '§', euro: '€', pound: '£', yen: '¥', cent: '¢', frac12: '½', frac14: '¼',
  frac34: '¾', sup1: '¹', sup2: '²', sup3: '³', larr: '←', rarr: '→', uarr: '↑',
  darr: '↓', harr: '↔', rArr: '⇒', lArr: '⇐', hArr: '⇔', le: '≤', ge: '≥', ne: '≠',
  asymp: '≈', infin: '∞', minus: '−', radic: '√', sum: '∑', prod: '∏', alpha: 'α',
  beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', sigma: 'σ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
}

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function mediaRef(rawName: string, element?: string): MediaRef | null {
  const name = decodeEntities(rawName).trim()
  if (!name) return null
  const kind = mediaKindFor(name)
  if (kind === 'image' || kind === 'audio' || kind === 'video') return { kind, name }
  if (element === 'img') return { kind: 'image', name }
  if (element === 'audio') return { kind: 'audio', name }
  if (element === 'video') return { kind: 'video', name }
  return null
}

export function htmlToText(html: string): FieldText {
  if (!/[<&[]/.test(html)) return { text: html.replace(/\s+/g, ' ').trim(), media: [] }

  const media: MediaRef[] = []
  let text = html.replace(COMMENTS, '').replace(DROPPED_ELEMENTS, '')
  text = text.replace(MEDIA_ELEMENT, (_tag, element: string, attributes: string) => {
    const src = SRC_ATTRIBUTE.exec(attributes)
    const ref = src ? mediaRef(src[1] ?? src[2] ?? src[3] ?? '', element.toLowerCase()) : null
    if (ref) media.push(ref)
    return ' '
  })
  text = text.replace(SOUND_TAG, (_tag, name: string) => {
    const ref = mediaRef(name, 'audio')
    if (ref) media.push(ref)
    return ' '
  })
  text = text.replace(BREAKING_TAGS, ' ').replace(ANY_TAG, '')
  text = decodeEntities(text).replace(/\s+/g, ' ').trim()
  return { text, media }
}
