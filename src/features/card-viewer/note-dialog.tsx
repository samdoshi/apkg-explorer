import { useCallback, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ListPopup } from '@/features/app-shell/list-popup'
import { LoadingStatus, type LoadingState } from '@/features/app-shell/loading-status'
import { useListPopup } from '@/features/app-shell/use-list-popup'
import type { NoteTypeInfo } from '@/features/package/collection'
import type { NoteDetail } from '@/features/package/note-detail'
import type { PackageClient } from '@/features/package/package-client'
import { usePackage } from '@/features/package/package-context'
import { usePackageData } from '@/features/package/use-package-data'
import { formatDate } from '@/lib/format'
import { usePrefersDark } from '@/lib/use-prefers-dark'
import { canPlay } from './can-play'
import { CardFrame } from './card-frame'
import type { FrameContent, FrameDocument } from './card-document'
import { ContentNotices } from './content-notices'
import { useContentPermissions } from './content-permissions'
import type { NoteDialogContext } from './note-dialog-context'
import { noteTitle } from './note-title'
import { prepareCards, prepareNote, type CardView } from './prepare'
import { describeCard } from './scheduling'
import { useContentScan } from './use-content-scan'
import { useFrames } from './use-frames'

/** #/notes/:noteTypeId/:noteId, shown over the notes table. */
export function NoteDialog() {
  const { state } = usePackage()
  const { noteId: noteIdParam } = useParams()
  const context = useOutletContext<NoteDialogContext>()
  // The chosen tab carries over to the next note when that note has it too.
  const [tab, setTab] = useState<string | null>(null)
  const noteId = Number(noteIdParam)
  const { noteType, orderedIds } = context
  const base = `/notes/${String(noteType.id)}`
  const popup = useListPopup({
    items: orderedIds,
    current: noteId,
    noun: 'note',
    listPath: base,
    itemPath: (id) => `${base}/${String(id)}`,
  })
  if (state.status !== 'ready') return null

  const sortField = context.rowFor(noteId)?.fields[noteType.sortFieldIndex] ?? ''
  const title = noteTitle(noteType.kind, sortField) || 'Note'

  return (
    <ListPopup
      popup={popup}
      title={title}
      details={[noteType.name]}
      className="sm:h-[min(92dvh,60rem)] sm:max-w-[min(80rem,calc(100%-2rem))]"
      onClosed={() => {
        context.onClosed(noteId)
      }}
    >
      <NoteBody
        key={noteId}
        client={state.client}
        collectionCreated={state.summary.collectionCreated}
        noteId={noteId}
        noteTypeId={noteType.id}
        tab={tab}
        onTabChange={setTab}
        onKey={popup.handleKey}
      />
    </ListPopup>
  )
}

interface NoteBodyProps {
  client: PackageClient
  collectionCreated: number
  noteId: number
  noteTypeId: number
  tab: string | null
  onTabChange: (tab: string) => void
  onKey: (key: string) => void
}

function NoteBody(props: NoteBodyProps) {
  const { client, noteId, noteTypeId } = props
  // Null when the file has no such note (of this note type).
  const detail = usePackageData(
    useCallback(async () => {
      const [note, noteType] = await Promise.all([client.getNote(noteId), client.getNoteType(noteTypeId)])
      return note && noteType && note.noteTypeId === noteTypeId ? { note, noteType } : null
    }, [client, noteId, noteTypeId]),
  )
  if (detail.status === 'ready' && detail.data) return <NoteTabs {...props} {...detail.data} />
  const state: LoadingState =
    detail.status === 'ready' ? { status: 'failed', message: 'This note isn’t in the open file.' } : detail
  return <LoadingStatus state={state} loading="Loading note…" failed="Couldn’t show this note" />
}

function NoteTabs({
  note,
  noteType,
  tab,
  onTabChange,
  ...props
}: NoteBodyProps & { note: NoteDetail; noteType: NoteTypeInfo }) {
  const cards = useMemo(() => prepareCards(noteType, note), [noteType, note])
  const noteContent = useMemo(() => prepareNote(noteType, note), [noteType, note])
  const known = tab !== null && (tab === 'note' || cards.some((card) => card.key === tab))
  const value = known ? tab : (cards[0]?.key ?? 'note')

  return (
    <Tabs value={value} onValueChange={onTabChange} className="min-h-0 flex-1 gap-0">
      <div className="overflow-x-auto px-4 pt-3">
        <TabsList aria-label="Cards">
          {cards.map((card) => (
            <TabsTrigger key={card.key} value={card.key}>
              {card.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="note">Note</TabsTrigger>
        </TabsList>
      </div>
      {cards.map((card) => (
        <TabsContent key={card.key} value={card.key} className="min-h-0 overflow-y-auto">
          <CardPanel {...props} view={card} />
        </TabsContent>
      ))}
      <TabsContent value="note" className="min-h-0 overflow-y-auto">
        <NotePanel {...props} content={noteContent} note={note} />
      </TabsContent>
    </Tabs>
  )
}

type PanelProps = Pick<NoteBodyProps, 'client' | 'collectionCreated' | 'onKey'>

function useFrameOptions() {
  const permissions = useContentPermissions()
  const nightMode = usePrefersDark()
  return { allowScripts: permissions.scripts, allowWeb: permissions.web, nightMode, canPlay }
}

function CardPanel({ client, collectionCreated, onKey, view }: PanelProps & { view: CardView }) {
  const contents = useMemo(() => [view.front, view.back], [view])
  const scan = useContentScan(client, contents)
  const frames = useFrames(client, contents, scan, useFrameOptions())
  const [front, back] = frames.status === 'ready' ? frames.frames : []

  return (
    // Phones: the panel scrolls, with each side 55% of the screen tall. From md up the
    // panel fits the dialog and the frames share its height.
    <div className="flex flex-col gap-3 p-4 md:h-full">
      {scan && <ContentNotices report={scan.report} noun="card" />}
      {frames.status === 'failed' ? (
        <FramesFailed message={frames.message} />
      ) : (
        <div className="grid gap-3 md:min-h-0 md:flex-1 md:grid-cols-2">
          <Side label="Front" title={`Front of ${view.label}`} frame={front} onKey={onKey} />
          <Side label="Back" title={`Back of ${view.label}`} frame={back} onKey={onKey} />
        </div>
      )}
      <dl aria-label="Card details" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {describeCard(view.card, collectionCreated).map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function NotePanel({ client, onKey, content, note }: PanelProps & { content: FrameContent; note: NoteDetail }) {
  const contents = useMemo(() => [content], [content])
  const scan = useContentScan(client, contents)
  const frames = useFrames(client, contents, scan, useFrameOptions())
  const details: [string, string][] = [
    ['Note ID', String(note.id)],
    ['Created', formatDate(note.created)],
    ['Modified', formatDate(note.modified)],
  ]

  return (
    <div className="flex flex-col gap-3 p-4 md:h-full">
      {scan && <ContentNotices report={scan.report} noun="note" />}
      {frames.status === 'failed' ? (
        <FramesFailed message={frames.message} />
      ) : (
        <div className="h-[70dvh] md:h-auto md:min-h-0 md:flex-1">
          <FrameSlot title="Note fields" frame={frames.status === 'ready' ? frames.frames[0] : undefined} onKey={onKey} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <ul aria-label="Tags" className="flex flex-wrap gap-1">
          {note.tags.length === 0 ? (
            <li className="text-muted-foreground">No tags</li>
          ) : (
            note.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))
          )}
        </ul>
        <dl aria-label="Note details" className="flex flex-wrap gap-x-4 gap-y-1">
          {details.map(([label, value]) => (
            <div key={label} className="flex gap-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function Side({
  label,
  title,
  frame,
  onKey,
}: {
  label: string
  title: string
  frame: FrameDocument | undefined
  onKey: (key: string) => void
}) {
  return (
    <section aria-label={label} className="flex h-[55dvh] flex-col gap-1.5 md:h-auto md:min-h-0">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <div className="min-h-0 flex-1">
        <FrameSlot title={title} frame={frame} onKey={onKey} />
      </div>
    </section>
  )
}

function FrameSlot({
  title,
  frame,
  onKey,
}: {
  title: string
  frame: FrameDocument | undefined
  onKey: (key: string) => void
}) {
  if (!frame) {
    return (
      <div className="flex size-full items-center justify-center rounded-lg border">
        <Spinner aria-label={`Loading ${title.toLowerCase()}`} />
      </div>
    )
  }
  return <CardFrame frame={frame} title={title} onKey={onKey} />
}

function FramesFailed({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t show this card</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
