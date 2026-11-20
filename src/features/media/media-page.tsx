import { getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useCallback, useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LoadingStatus } from '@/features/app-shell/loading-status'
import type { PackageClient } from '@/features/package/package-client'
import { usePackage } from '@/features/package/package-context'
import { usePackageData } from '@/features/package/use-package-data'
import { formatBytes, formatCount, formatNumber } from '@/lib/format'
import { openedFromList } from '@/lib/opened-from-list'
import { kindInfo } from './kinds'
import type { MediaPreviewContext } from './media-preview-context'
import {
  buildMediaRows,
  countKinds,
  filterMediaRows,
  isKindFilter,
  MEDIA_KINDS,
  mediaPath,
  totalSize,
  type KindFilter,
  type MediaRow,
} from './media-rows'
import { mediaColumns } from './media-columns'
import { MediaTable, type MediaTableHandle } from './media-table'

/** #/media */
export function MediaPage() {
  const { state } = usePackage()
  if (state.status !== 'ready') return null
  // Keyed so the search, filter and sorting start fresh for each file.
  return <MediaLoader key={state.client.id} client={state.client} fileName={state.summary.fileName} />
}

function MediaLoader({ client, fileName }: { client: PackageClient; fileName: string }) {
  const loaded = usePackageData(useCallback(async () => buildMediaRows(await client.getMediaList()), [client]))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <title>{`Media · ${fileName} · APKG Explorer`}</title>
      {loaded.status === 'ready' ? (
        <MediaBrowser rows={loaded.data} />
      ) : (
        <>
          <Toolbar />
          <LoadingStatus state={loaded} loading="Loading media…" failed="Couldn’t load the media list" />
        </>
      )}
    </div>
  )
}

function MediaBrowser({ rows }: { rows: MediaRow[] }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  // The package's own order means nothing, so there's always a sort, starting with the name.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const deferredQuery = useDeferredValue(query)
  const visibleRows = useMemo(() => filterMediaRows(rows, deferredQuery, kind), [rows, deferredQuery, kind])
  const counts = useMemo(() => countKinds(rows), [rows])
  const rowsByName = useMemo(() => new Map(rows.map((row) => [row.name, row])), [rows])
  const navigate = useNavigate()
  const tableRef = useRef<MediaTableHandle>(null)

  const table = useReactTable({
    data: visibleRows,
    columns: mediaColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.name,
    sortDescFirst: false,
    enableSortingRemoval: false,
  })

  const clearAll = () => {
    setQuery('')
    setKind('all')
  }
  const narrowed = visibleRows.length !== rows.length

  // The preview steps through files in the list's current order.
  const sortedRows = table.getRowModel().rows
  const orderedNames = useMemo(() => sortedRows.map((row) => row.original.name), [sortedRows])
  const previewContext: MediaPreviewContext = {
    orderedNames,
    rowFor: (name) => rowsByName.get(name),
    onClosed: (name) => tableRef.current?.focusFile(name),
  }
  const openFile = (name: string) => {
    void navigate(mediaPath(name), { state: openedFromList })
  }

  return (
    <>
      <Toolbar>
        {rows.length > 0 && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Kind"
            value={kind}
            onValueChange={(value) => {
              // Clicking the chosen kind again would clear the choice; keep it instead.
              if (isKindFilter(value)) setKind(value)
            }}
          >
            <ToggleGroupItem value="all">
              All <span className="text-muted-foreground tabular-nums">{formatNumber(rows.length)}</span>
            </ToggleGroupItem>
            {MEDIA_KINDS.filter((item) => counts[item] > 0).map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {kindInfo[item].plural}{' '}
                <span className="text-muted-foreground tabular-nums">{formatNumber(counts[item])}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search media"
            placeholder="Search file names"
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
            ? `Showing ${formatCount(visibleRows.length, 'file')} of ${formatNumber(rows.length)}`
            : formatCount(rows.length, 'file')}
          {' · '}
          {formatBytes(totalSize(visibleRows))}
        </p>
        {narrowed && (
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>
      <MediaTable ref={tableRef} table={table} totalCount={rows.length} onClearAll={clearAll} onOpen={openFile} />
      <Outlet context={previewContext} />
    </>
  )
}

function Toolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <h1 className="mr-2 text-base font-semibold">Media</h1>
      {children}
    </div>
  )
}
