import { flexRender, type Table } from '@tanstack/react-table'
import { useImperativeHandle, useRef, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useVirtualRows } from '@/lib/use-virtual-rows'
import type { NoteRow } from '@/features/package/note-row'
import type { Facets } from './column-filter'
import { ColumnHeader } from './column-header'
import { cellTitle, type ColumnInfo } from './columns'
import { fieldIndexOf, type ColumnFilter, type ColumnFilters, type ColumnId } from './filters'

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 41

/** The pinned first column never takes more than 40% of a narrow screen. */
const columnWidth = (size: number, pinned: boolean) => (pinned ? `min(${String(size)}px, 40vw)` : size)

export interface NotesTableHandle {
  /** Scrolls to a note's row and focuses it (e.g. after its popup closes). */
  focusNote: (noteId: number) => void
}

interface NotesTableProps {
  ref?: Ref<NotesTableHandle>
  table: Table<NoteRow>
  info: Map<string, ColumnInfo>
  filters: ColumnFilters
  facets: Facets
  totalCount: number
  noteTypeName: string
  onFilterChange: (columnId: ColumnId, filter: ColumnFilter | null) => void
  onClearAll: () => void
  /** Opens a note's popup (click, or Enter on a focused row). */
  onOpen: (noteId: number) => void
}

export function NotesTable({
  ref,
  table,
  info,
  filters,
  facets,
  totalCount,
  noteTypeName,
  onFilterChange,
  onClearAll,
  onOpen,
}: NotesTableProps) {
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
      if (row) onOpen(row.original.id)
    },
  })

  useImperativeHandle(ref, () => ({
    focusNote(noteId) {
      const index = rows.findIndex((row) => row.original.id === noteId)
      if (index >= 0) moveTo(index)
    },
  }))

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
        <tbody onKeyDown={onKeyDown}>
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
                  onOpen(row.original.id)
                }}
                className="group cursor-pointer outline-none focus-visible:[&>td]:bg-accent"
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
