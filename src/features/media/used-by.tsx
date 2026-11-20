import { useCallback, useId, useMemo } from 'react'
import { Link } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { noteTitle } from '@/features/card-viewer/note-title'
import type { MediaPlace } from '@/features/package/media-usage'
import type { NoteTypeSummary } from '@/features/package/package'
import type { PackageClient } from '@/features/package/package-client'
import { usePackageData } from '@/features/package/use-package-data'
import { formatCount } from '@/lib/format'
import { isUsed, type MediaRow } from './media-rows'

interface UsedByProps {
  client: PackageClient
  file: MediaRow
  noteTypes: readonly NoteTypeSummary[]
}

/** The preview's list of where a file is used: links to its notes, and other places. */
export function UsedBy({ client, file, noteTypes }: UsedByProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex max-h-36 shrink-0 flex-col gap-1.5 overflow-y-auto border-t px-4 py-3 text-sm"
    >
      <h3 id={headingId} className="text-xs font-medium text-muted-foreground">
        Used by
      </h3>
      {isUsed(file) ? (
        <Uses client={client} name={file.name} noteTypes={noteTypes} />
      ) : (
        <p className="text-muted-foreground">
          Nothing in this package refers to this file.
          {file.name.startsWith('_') &&
            ' Anki keeps files whose names start with _ anyway, as scripts in card templates may load them.'}
        </p>
      )}
    </section>
  )
}

function placeLabel(place: MediaPlace): string {
  switch (place.kind) {
    case 'templates':
      return `Card templates of ${place.noteType}`
    case 'styling':
      return `Styling of ${place.noteType}`
    case 'stylesheet':
      return `Stylesheet ${place.name}`
  }
}

function Uses({ client, name, noteTypes }: { client: PackageClient; name: string; noteTypes: readonly NoteTypeSummary[] }) {
  const use = usePackageData(useCallback(() => client.getMediaUse(name), [client, name]))
  const byId = useMemo(() => new Map(noteTypes.map((noteType) => [noteType.id, noteType])), [noteTypes])
  if (use.status === 'loading') return <Spinner aria-label="Finding where this file is used" />
  if (use.status === 'failed') return <p className="text-destructive">{use.message}</p>

  const { notes, noteCount, places } = use.data
  const more = noteCount - notes.length
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {notes.map((note) => {
        const noteType = byId.get(note.noteTypeId)
        return (
          <li key={note.id} className="max-w-full min-w-0">
            {/* Opens the note's popup over its table; Back comes back here. */}
            <Link
              to={`/notes/${String(note.noteTypeId)}/${String(note.id)}`}
              title={noteType && `${noteType.name} note`}
              className="block truncate rounded-sm font-medium underline decoration-muted-foreground/50 underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {noteTitle(noteType?.kind ?? 'normal', note.text) || 'Untitled note'}
            </Link>
          </li>
        )
      })}
      {more > 0 && <li className="text-muted-foreground">and {formatCount(more, 'more note', 'more notes')}</li>}
      {places.map((place) => (
        <li key={placeLabel(place)} className="text-muted-foreground">
          {placeLabel(place)}
        </li>
      ))}
    </ul>
  )
}
