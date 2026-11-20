import { stripClozes } from './cloze'

/** A note's title: its sort field's text, with cloze markup removed. Empty if that's blank. */
export function noteTitle(kind: 'normal' | 'cloze', sortField: string): string {
  return (kind === 'cloze' ? stripClozes(sortField) : sortField).trim()
}
