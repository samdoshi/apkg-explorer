import type { NoteTypeSummary, PackageSummary } from '@/features/package/package'

/** Note types worth offering in the menu: those with notes (Anki exports can include empty ones). */
export function browsableNoteTypes(summary: PackageSummary): NoteTypeSummary[] {
  const withNotes = summary.noteTypes.filter((type) => type.noteCount > 0)
  return withNotes.length > 0 ? withNotes : summary.noteTypes
}

/** The note type to show first: the one with the most notes. */
export function defaultNoteType(summary: PackageSummary): NoteTypeSummary | undefined {
  return browsableNoteTypes(summary).reduce<NoteTypeSummary | undefined>(
    (best, type) => (!best || type.noteCount > best.noteCount ? type : best),
    undefined,
  )
}
