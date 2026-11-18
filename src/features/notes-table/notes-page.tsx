import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { Search, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { NoteRow } from '@/features/package/note-row'
import type { NoteTypeSummary, PackageSummary } from '@/features/package/package'
import type { PackageClient } from '@/features/package/package-client'
import { usePackage } from '@/features/package/package-context'
import { formatCount } from '@/lib/format'
import { buildColumns } from './columns'
import { computeFacets } from './facets'
import {
  describeFilter,
  filterRows,
  isFilterActive,
  type ColumnFilter,
  type ColumnFilters,
  type ColumnId,
} from './filters'
import { browsableNoteTypes, defaultNoteType } from './note-types'
import { NotesTable } from './notes-table'
import { useNoteRows } from './use-note-rows'

/** #/notes: go to the note type with the most notes. */
export function NotesIndex() {
  const { state } = usePackage()
  if (state.status !== 'ready') return null
  const noteType = defaultNoteType(state.summary)
  if (!noteType) {
    return <p className="p-8 text-center text-muted-foreground">This package has no note types.</p>
  }
  return <Navigate to={`/notes/${String(noteType.id)}`} replace />
}

/** #/notes/:noteTypeId */
export function NotesPage() {
  const { state } = usePackage()
  const { noteTypeId } = useParams()
  if (state.status !== 'ready') return null
  const noteType = state.summary.noteTypes.find((type) => String(type.id) === noteTypeId)
  if (!noteType) return <Navigate to="/notes" replace />
  // Keyed so filters and sorting start fresh for each note type and each file.
  return (
    <NotesLoader
      key={`${String(state.client.id)}:${String(noteType.id)}`}
      client={state.client}
      summary={state.summary}
      noteType={noteType}
    />
  )
}

function NotesLoader({
  client,
  summary,
  noteType,
}: {
  client: PackageClient
  summary: PackageSummary
  noteType: NoteTypeSummary
}) {
  const loaded = useNoteRows(client, noteType.id)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <title>{`${noteType.name} · ${summary.fileName} · APKG Explorer`}</title>
      {loaded.status === 'ready' ? (
        <NotesBrowser rows={loaded.rows} summary={summary} noteType={noteType} />
      ) : (
        <>
          <Toolbar summary={summary} noteType={noteType} />
          <div className="flex flex-1 items-start justify-center p-8">
            {loaded.status === 'loading' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden="true" role="presentation" />
                Loading notes…
              </p>
            ) : (
              <Alert variant="destructive" className="max-w-lg">
                <AlertTitle>Couldn’t load the notes</AlertTitle>
                <AlertDescription>{loaded.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NotesBrowser({
  rows,
  summary,
  noteType,
}: {
  rows: NoteRow[]
  summary: PackageSummary
  noteType: NoteTypeSummary
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<ColumnFilters>({})
  const [sorting, setSorting] = useState<SortingState>([])
  // Typing stays responsive on big decks: filtering runs at a lower priority.
  const deferredQuery = useDeferredValue(query)
  const deferredFilters = useDeferredValue(filters)
  const visibleRows = useMemo(
    () => filterRows(rows, deferredQuery, deferredFilters),
    [rows, deferredQuery, deferredFilters],
  )
  const { columns, info } = useMemo(() => buildColumns(noteType.fieldNames), [noteType.fieldNames])
  const facets = useMemo(() => computeFacets(rows), [rows])

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.id),
    sortDescFirst: false,
  })

  const setFilter = (columnId: ColumnId, filter: ColumnFilter | null) => {
    setFilters((previous) => ({ ...previous, [columnId]: filter ?? undefined }))
  }
  const clearAll = () => {
    setFilters({})
    setQuery('')
  }

  const active = Object.entries(filters).flatMap(([columnId, filter]) =>
    filter && isFilterActive(filter)
      ? [{ columnId: columnId as ColumnId, label: describeFilter(info.get(columnId)?.label ?? columnId, filter) }]
      : [],
  )
  const narrowed = visibleRows.length !== rows.length

  return (
    <>
      <Toolbar summary={summary} noteType={noteType}>
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search notes"
            placeholder="Search fields, tags and decks"
            className="pl-8"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>
      </Toolbar>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
        <p role="status" className="mr-1 text-muted-foreground">
          {narrowed
            ? `Showing ${formatCount(visibleRows.length, 'note')} of ${rows.length.toLocaleString('en')}`
            : formatCount(rows.length, 'note')}
        </p>
        {active.length > 0 && (
          <ul aria-label="Active filters" className="flex flex-wrap gap-1.5">
            {active.map(({ columnId, label }) => (
              <li key={columnId}>
                <Button
                  variant="secondary"
                  size="xs"
                  aria-label={`Remove filter: ${label}`}
                  onClick={() => {
                    setFilter(columnId, null)
                  }}
                >
                  {label}
                  <X data-icon="inline-end" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {(active.length > 0 || query) && (
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>
      <NotesTable
        table={table}
        info={info}
        filters={filters}
        facets={facets}
        totalCount={rows.length}
        noteTypeName={noteType.name}
        onFilterChange={setFilter}
        onClearAll={clearAll}
      />
    </>
  )
}

function Toolbar({
  summary,
  noteType,
  children,
}: {
  summary: PackageSummary
  noteType: NoteTypeSummary
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const choices = browsableNoteTypes(summary)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      {choices.length > 1 ? (
        <>
          <h1 className="sr-only">{noteType.name} notes</h1>
          <Select
            value={String(noteType.id)}
            onValueChange={(id) => {
              void navigate(`/notes/${id}`)
            }}
          >
            <SelectTrigger aria-label="Note type" className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  <span className="truncate">{type.name}</span>
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {formatCount(type.noteCount, 'note')}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        <h1 className="mr-2 truncate text-base font-semibold">{noteType.name}</h1>
      )}
      {children}
    </div>
  )
}
