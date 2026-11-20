import { getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useCallback, useDeferredValue, useMemo, useRef, useState, type ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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
  countUsage,
  filterMediaRows,
  isKindFilter,
  isUsageFilter,
  matchesUsage,
  MEDIA_KINDS,
  mediaPath,
  totalSize,
  type KindFilter,
  type MediaRow,
  type UsageFilter,
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
  const [usage, setUsage] = useState<UsageFilter>('any')
  // The package's own order means nothing, so there's always a sort, starting with the name.
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const deferredQuery = useDeferredValue(query)
  // Rows are the package's files and then the missing ones; the usage filter picks between them.
  const fileCount = useMemo(() => rows.filter((row) => !row.missing).length, [rows])
  const usageCounts = useMemo(() => countUsage(rows), [rows])
  const inUsage = useMemo(() => rows.filter((row) => matchesUsage(row, usage)), [rows, usage])
  const visibleRows = useMemo(() => filterMediaRows(inUsage, deferredQuery, kind), [inUsage, deferredQuery, kind])
  // The kind filter counts what the usage filter lets through.
  const counts = useMemo(() => countKinds(inUsage), [inUsage])
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
    setUsage('any')
  }
  const narrowed = usage !== 'any' || visibleRows.length !== fileCount
  const showUsage = usageCounts.unused + usageCounts.missing > 0 || usage !== 'any'

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
            // Wraps on phones instead of making the page scroll sideways.
            className="flex-wrap"
            value={kind}
            onValueChange={(value) => {
              // Clicking the chosen kind again would clear the choice; keep it instead.
              if (isKindFilter(value)) setKind(value)
            }}
          >
            <ToggleGroupItem value="all">
              All <span className="text-muted-foreground tabular-nums">{formatNumber(inUsage.length)}</span>
            </ToggleGroupItem>
            {MEDIA_KINDS.filter((item) => counts[item] > 0 || item === kind).map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {kindInfo[item].plural}{' '}
                <span className="text-muted-foreground tabular-nums">{formatNumber(counts[item])}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {showUsage && (
          // Phones wrap the two groups onto lines of their own.
          <Separator orientation="vertical" className="hidden h-6 data-vertical:self-center sm:block" />
        )}
        {showUsage && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Usage"
            className="flex-wrap"
            // None chosen: every file in the package. Clicking the chosen one again clears it.
            value={usage === 'any' ? '' : usage}
            onValueChange={(value) => {
              setUsage(isUsageFilter(value) ? value : 'any')
            }}
          >
            {USAGE_CHOICES.filter(({ value }) => usageCounts[value] > 0 || value === usage).map(({ value, label, title }) => (
              <ToggleGroupItem key={value} value={value} title={title}>
                {label} <span className="text-muted-foreground tabular-nums">{formatNumber(usageCounts[value])}</span>
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
          {usage === 'missing'
            ? formatCount(visibleRows.length, 'missing file')
            : `${
                narrowed
                  ? `Showing ${formatCount(visibleRows.length, 'file')} of ${formatNumber(fileCount)}`
                  : formatCount(fileCount, 'file')
              } · ${formatBytes(totalSize(visibleRows))}`}
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

const USAGE_CHOICES: { value: Exclude<UsageFilter, 'any'>; label: string; title: string }[] = [
  { value: 'used', label: 'Used', title: 'Files that notes, card templates or styling refer to' },
  { value: 'unused', label: 'Unused', title: 'Files nothing in the package refers to' },
  { value: 'missing', label: 'Missing', title: 'Files that notes, templates or styling refer to, but the package lacks' },
]

function Toolbar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <h1 className="mr-2 text-base font-semibold">Media</h1>
      {children}
    </div>
  )
}
