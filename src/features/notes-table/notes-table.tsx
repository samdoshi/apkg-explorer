import { flexRender, type Table } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NoteRow } from '@/features/package/note-row'
import type { Facets } from './column-filter'
import { ColumnHeader } from './column-header'
import { cellTitle, type ColumnInfo } from './columns'
import { fieldIndexOf, type ColumnFilter, type ColumnFilters, type ColumnId } from './filters'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 41

/** The pinned first column never takes more than 40% of a narrow screen. */
const columnWidth = (size: number, pinned: boolean) => (pinned ? `min(${String(size)}px, 40vw)` : size)

interface NotesTableProps {
  table: Table<NoteRow>
  info: Map<string, ColumnInfo>
  filters: ColumnFilters
  facets: Facets
  totalCount: number
  noteTypeName: string
  onFilterChange: (columnId: ColumnId, filter: ColumnFilter | null) => void
  onClearAll: () => void
}

export function NotesTable({
  table,
  info,
  filters,
  facets,
  totalCount,
  noteTypeName,
  onFilterChange,
  onClearAll,
}: NotesTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const [activeIndex, setActiveIndex] = useState(0)
  const pendingFocus = useRef<number | null>(null)
  const current = Math.min(activeIndex, Math.max(rows.length - 1, 0))

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    paddingStart: HEADER_HEIGHT,
    scrollPaddingStart: HEADER_HEIGHT,
  })
  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length ? (items[0]?.start ?? 0) - HEADER_HEIGHT : 0
  const paddingBottom = items.length ? virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0) : 0

  // After keyboard navigation, focus the target row once it has been rendered.
  useEffect(() => {
    if (pendingFocus.current === null) return
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${String(pendingFocus.current)}"]`)
    if (row) {
      row.focus({ preventScroll: true })
      pendingFocus.current = null
    }
  })

  function moveTo(index: number) {
    if (rows.length === 0) return
    const next = Math.max(0, Math.min(rows.length - 1, index))
    setActiveIndex(next)
    pendingFocus.current = next
    virtualizer.scrollToIndex(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_HEIGHT) - 1)
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      PageDown: current + page,
      PageUp: current - page,
      Home: 0,
      End: rows.length - 1,
    }
    const target = moves[event.key]
    if (target === undefined || event.altKey || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    moveTo(target)
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
      <table
        aria-label={`${noteTypeName} notes`}
        aria-rowcount={rows.length + 1}
        className="w-max min-w-full table-fixed border-separate border-spacing-0 text-sm"
      >
        <colgroup>
          {headers.map((header, index) => (
            <col key={header.id} style={{ width: columnWidth(header.getSize(), index === 0) }} />
          ))}
        </colgroup>
        <thead>
          <tr aria-rowindex={1}>
            {headers.map((header, index) => {
              const columnInfo = info.get(header.column.id)
              if (!columnInfo) return null
              return (
                <ColumnHeader
                  key={header.id}
                  header={header}
                  info={columnInfo}
                  filter={filters[columnInfo.id]}
                  facets={facets}
                  pinned={index === 0}
                  onFilterChange={(filter) => {
                    onFilterChange(columnInfo.id, filter)
                  }}
                />
              )
            })}
          </tr>
        </thead>
        <tbody onKeyDown={handleKeyDown}>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: paddingTop }} colSpan={headers.length} />
            </tr>
          )}
          {items.map((item) => {
            const row = rows[item.index]
            if (!row) return null
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
                }}
                className="group outline-none focus-visible:[&>td]:bg-accent"
                style={{ height: ROW_HEIGHT }}
              >
                {row.getVisibleCells().map((cell, index) => {
                  const columnInfo = info.get(cell.column.id)
                  return (
                    <td
                      key={cell.id}
                      title={columnInfo ? cellTitle(row.original, columnInfo, fieldIndexOf(cell.column.id)) || undefined : undefined}
                      className={cn(
                        'max-w-0 border-b bg-background px-3 group-hover:bg-muted/60',
                        index === 0 && 'sticky left-0 z-10 border-r font-medium',
                      )}
                    >
                      <div className="flex min-w-0 items-center">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td style={{ height: paddingBottom }} colSpan={headers.length} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="sticky left-0 flex w-full max-w-[100vw] flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {totalCount === 0 ? 'This note type has no notes.' : 'No notes match the search and filters.'}
          </p>
          {totalCount > 0 && (
            <Button variant="outline" size="sm" onClick={onClearAll}>
              Clear search and filters
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
