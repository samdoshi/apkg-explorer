import type { Header, Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useImperativeHandle, useRef, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/format'
import { useVirtualRows } from '@/lib/use-virtual-rows'
import { cn } from '@/lib/utils'
import { kindInfo } from './kinds'
import type { MediaRow } from './media-rows'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 41

/** Per column: width, alignment, and the Kind column only from sm up (phones see the icon). */
const columnClass: Record<string, string> = {
  name: '',
  kind: 'hidden w-28 sm:table-cell',
  size: 'w-24 text-right sm:w-28',
}

export interface MediaTableHandle {
  /** Scrolls to a file's row and focuses it (e.g. after its preview closes). */
  focusFile: (name: string) => void
}

interface MediaTableProps {
  ref?: Ref<MediaTableHandle>
  table: Table<MediaRow>
  totalCount: number
  onClearAll: () => void
  /** Opens a file's preview (click, or Enter on a focused row). */
  onOpen: (name: string) => void
}

export function MediaTable({ ref, table, totalCount, onClearAll, onOpen }: MediaTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const { items, paddingTop, paddingBottom, current, setActiveIndex, moveTo, onKeyDown } = useVirtualRows({
    count: rows.length,
    scrollRef,
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    onOpen: (index) => {
      const row = rows[index]
      if (row) onOpen(row.original.name)
    },
  })

  useImperativeHandle(ref, () => ({
    focusFile(name) {
      const index = rows.findIndex((row) => row.original.name === name)
      if (index >= 0) moveTo(index)
    },
  }))

  return (
    // Relative: the rows' screen-reader-only text is absolutely positioned, and would
    // otherwise stretch the page below the list instead of scrolling with it.
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
      <table
        aria-label="Media files"
        aria-rowcount={rows.length + 1}
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
      >
        <thead>
          <tr aria-rowindex={1}>
            {headers.map((header) => (
              <SortHeader key={header.id} header={header} />
            ))}
          </tr>
        </thead>
        <tbody onKeyDown={onKeyDown}>
          {/* Spacers for the rows not rendered. No colSpan: phones show fewer columns, and a
              span wider than the header row would add an empty column there. */}
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: paddingTop }} />
            </tr>
          )}
          {items.map((item) => {
            const row = rows[item.index]
            if (!row) return null
            const file = row.original
            const { label, icon: Icon } = kindInfo[file.kind]
            return (
              <tr
                key={row.id}
                data-index={item.index}
                aria-rowindex={item.index + 2}
                tabIndex={item.index === current ? 0 : -1}
                onFocus={() => {
                  setActiveIndex(item.index)
                }}
                onClick={() => {
                  setActiveIndex(item.index)
                  onOpen(file.name)
                }}
                className="group cursor-pointer outline-none focus-visible:[&>td]:bg-accent"
                style={{ height: ROW_HEIGHT }}
              >
                <td title={file.name} className="max-w-0 border-b px-3 group-hover:bg-muted/60">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{file.name}</span>
                    {/* The Kind column is hidden on phones; screen readers still hear the kind. */}
                    <span className="sr-only sm:hidden">({label})</span>
                  </span>
                </td>
                <td className={cn('border-b px-3 text-muted-foreground group-hover:bg-muted/60', columnClass.kind)}>
                  {label}
                </td>
                <td
                  title={file.size === null ? undefined : `${file.size.toLocaleString('en')} bytes`}
                  className={cn('border-b px-3 tabular-nums group-hover:bg-muted/60', columnClass.size)}
                >
                  {file.size === null ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Unknown</span>
                    </>
                  ) : (
                    formatBytes(file.size)
                  )}
                </td>
              </tr>
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0 ? 'This package has no media files.' : 'No files match the search and filter.'}
          </p>
          {totalCount > 0 && (
            <Button variant="outline" size="sm" onClick={onClearAll}>
              Clear search and filter
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function SortHeader({ header }: { header: Header<MediaRow, unknown> }) {
  const column = header.column
  const label = typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id
  const sorted = column.getIsSorted()
  const sortIndex = column.getSortIndex()
  const multiSort = header.getContext().table.getState().sorting.length > 1
  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  const ariaSort =
    sortIndex === 0 ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined) : undefined
  const numeric = column.id === 'size'

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn('sticky top-0 z-20 h-10 border-b bg-muted p-0 text-left font-medium', columnClass[column.id])}
    >
      <button
        type="button"
        onClick={column.getToggleSortingHandler()}
        title="Sort (shift-click to add a secondary sort)"
        className={cn(
          'flex h-full w-full min-w-0 items-center gap-1.5 px-3 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
          numeric && 'justify-end',
        )}
      >
        <span className="truncate">{label}</span>
        <SortIcon className={cn('size-3.5 shrink-0', !sorted && 'text-muted-foreground/60')} aria-hidden="true" />
        {sorted && multiSort && <span className="text-xs text-muted-foreground tabular-nums">{sortIndex + 1}</span>}
      </button>
    </th>
  )
}
