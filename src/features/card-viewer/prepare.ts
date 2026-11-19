import type { NoteTypeInfo } from '@/features/package/collection'
import type { CardDetail, NoteDetail } from '@/features/package/note-detail'
import { finishField, finishSide } from './card-html'
import type { FrameContent } from './card-document'
import { escapeHtml } from './escape'
import { buildFieldMap, renderCard } from './template'
import { fieldIsEmpty } from './template-filters'

/** One card tab: the card and the content of its two frames. */
export interface CardView {
  /** Tab value; the same for the same template across notes. */
  key: string
  label: string
  card: CardDetail
  front: FrameContent
  back: FrameContent
}

/** Anki puts the card inside <div id="qa"> on a body with the card classes. */
const inQa = ([part = '']: string[]) => `<div id="qa">${part}</div>`

export function prepareCards(noteType: NoteTypeInfo, note: NoteDetail): CardView[] {
  const isCloze = noteType.kind === 'cloze'
  const fieldNames = noteType.fields.map((field) => field.name)
  const seen = new Set<string>()
  return note.cards.map((card) => {
    // A cloze note type has one template; its cards differ by cloze number.
    const template = isCloze
      ? noteType.templates[0]
      : noteType.templates.find((candidate) => candidate.ord === card.ord)
    const number = card.ord + 1
    const label = isCloze ? `Cloze ${String(number)}` : (template?.name ?? `Card ${String(number)}`)
    const fields = buildFieldMap({
      fieldNames,
      fieldValues: note.fields,
      tags: note.tags,
      noteTypeName: noteType.name,
      deckName: card.deckName,
      templateName: template?.name ?? label,
      flag: card.flag,
      cardId: card.id,
      ord: card.ord,
    })
    const sides = template
      ? renderCard({ front: template.front, back: template.back, fields, ord: card.ord, isCloze })
      : { question: missingTemplate, answer: missingTemplate }
    const side = (html: string, question: boolean): FrameContent => ({
      parts: [{ label: question ? 'Front' : 'Back', html: finishSide(html, { question, fields, cardNumber: number }) }],
      layout: inQa,
      css: noteType.css,
      bodyClass: `card card${String(number)}`,
    })
    let key = `card-${String(card.ord)}`
    if (seen.has(key)) key = `${key}-${String(card.id)}`
    seen.add(key)
    return { key, label, card, front: side(sides.question, true), back: side(sides.answer, false) }
  })
}

const missingTemplate =
  '<div class="apkg-template-problem"><p>This card’s template isn’t in the file.</p></div>'

/** The Note tab: every field, rendered, under its name. */
export function prepareNote(noteType: NoteTypeInfo, note: NoteDetail): FrameContent {
  const count = Math.max(noteType.fields.length, note.fields.length)
  const names = Array.from({ length: count }, (_, index) => noteType.fields[index]?.name ?? `Field ${String(index + 1)}`)
  return {
    parts: names.map((name, index) => ({ label: name, html: finishField(note.fields[index] ?? '') })),
    layout: (parts) =>
      `<dl class="apkg-fields">${parts
        .map((part, index) => {
          const value = fieldIsEmpty(part) ? '<span class="apkg-empty">(empty)</span>' : part
          return `<div class="apkg-field"><dt>${escapeHtml(names[index] ?? '')}</dt><dd>${value}</dd></div>`
        })
        .join('')}</dl>`,
    css: noteType.css,
    bodyClass: 'apkg-note',
  }
}
