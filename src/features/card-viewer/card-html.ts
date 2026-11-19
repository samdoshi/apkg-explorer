import { mediaKindFor } from '@/features/package/mime'
import { clozeOnly } from './cloze'
import { escapeHtml } from './escape'
import { stripHtml } from './template-filters'

/*
 * What Anki's reviewer does to a rendered side before showing it: type-answer boxes,
 * [sound:…] players and [anki:tts] text.
 */

const TYPE_ANSWER = /\[\[type:(.+?)\]\]/g
const SOUND = /\[sound:(.+?)\]/g
const TTS = /\[anki:tts(?:\s[^\]]*)?\]([\s\S]*?)\[\/anki:tts\]/g

export interface SideOptions {
  question: boolean
  fields: ReadonlyMap<string, string>
  /** The card's number: template index + 1, which is also its cloze number. */
  cardNumber: number
}

/**
 * The question gets a (disabled) answer box. The answer gets the expected answer
 * instead, which is what Anki shows when nothing was typed.
 */
function typeAnswer(spec: string, { question, fields, cardNumber }: SideOptions): string {
  if (question) {
    return '<input type="text" id="typeans" disabled aria-label="Answer box (typing is off in this viewer)">'
  }
  const [kind, ...rest] = spec.split(':')
  const isCloze = kind === 'cloze' && rest.length > 0
  const fieldName = isCloze || (kind === 'nc' && rest.length > 0) ? rest.join(':') : spec
  const field = fields.get(fieldName)
  if (field === undefined) return `<code id="typeans">Type answer: unknown field ${escapeHtml(fieldName)}</code>`
  const expected = stripHtml(isCloze ? clozeOnly(field, cardNumber, false) : field).trim()
  return `<code id="typeans">${escapeHtml(expected)}</code>`
}

function soundPlayer(name: string): string {
  const label = escapeHtml(name)
  // Video files in [sound:…] tags play inline; nothing autoplays.
  return mediaKindFor(name) === 'video'
    ? `<video controls preload="metadata" src="${label}" aria-label="Video: ${label}"></video>`
    : `<audio controls preload="metadata" src="${label}" aria-label="Audio: ${label}"></audio>`
}

/** Turns a rendered side into the HTML to display (still to be cleaned by sanitize.ts). */
export function finishSide(html: string, options: SideOptions): string {
  return html
    .replace(TYPE_ANSWER, (_match, spec: string) => typeAnswer(spec, options))
    .replace(TTS, '$1')
    .replace(SOUND, (_match, name: string) => soundPlayer(name.trim()))
}

/** The note tab shows raw fields; only [sound:…] needs turning into players. */
export function finishField(html: string): string {
  return html.replace(SOUND, (_match, name: string) => soundPlayer(name.trim()))
}
