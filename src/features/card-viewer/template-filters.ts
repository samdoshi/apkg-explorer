import { decodeEntities } from '@/features/package/html-text'
import { escapeHtml } from './escape'

/*
 * Anki's built-in template filters (rslib/src/template_filters.rs), apart from the
 * cloze ones (cloze.ts) and the type-answer ones, which template.ts turns into placeholders
 * for card-html.ts to fill in.
 */

/** `漢字[かんじ]`, with an optional space before it that separates it from earlier text. */
const FURIGANA = / ?([^ >]+?)\[(.+?)\]/g

function replaceFurigana(text: string, render: (base: string, reading: string) => string): string {
  return text.replaceAll('&nbsp;', ' ').replace(FURIGANA, (match, base: string, reading: string) =>
    // [sound:...] matches the pattern too; leave it alone.
    reading.startsWith('sound:') ? match : render(base, reading),
  )
}

export const furigana = (text: string) =>
  replaceFurigana(text, (base, reading) => `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`)
export const kana = (text: string) => replaceFurigana(text, (_base, reading) => reading)
export const kanji = (text: string) => replaceFurigana(text, (base) => base)

/**
 * Anki shows a link that reveals the field with a script. A <details> element does the
 * same without one, so hints work with scripts blocked.
 */
export function hint(text: string, fieldName: string): string {
  if (!text.trim()) return text
  return `<details class="hint"><summary>${escapeHtml(fieldName)}</summary><div class="hint">${text}</div></details>`
}

/** The `text` filter: tags and comments removed, entities decoded (as Anki does). */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->|<[\s\S]*?>/g, ''))
}

/** Anki treats a field holding only whitespace, <br> and <div> tags as empty. */
const EMPTY_FIELD = /^(?:[\t\n\v\f\r ]|<\/?(?:br|div) ?\/?>)*$/i

export function fieldIsEmpty(text: string): boolean {
  return EMPTY_FIELD.test(text)
}
