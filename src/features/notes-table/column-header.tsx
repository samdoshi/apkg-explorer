import type { Header } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { NoteRow } from '@/features/package/note-row'
import { ColumnFilterEditor, type Facets } from './column-filter'
import type { ColumnInfo } from './columns'
import { isFilterActive, type ColumnFilter } from './filters'

interface ColumnHeaderProps {
  header: Header<NoteRow, unknown>
  info: ColumnInfo
  filter: ColumnFilter | undefined
  facets: Facets
  onFilterChange: (filter: ColumnFilter | null) => void
  pinned: boolean
}

export function ColumnHeader({ header, info, filter, facets, onFilterChange, pinned }: ColumnHeaderProps) {
  const column = header.column
  const sorted = column.getIsSorted()
  const sortIndex = column.getSortIndex()
  const multiSort = header.getContext().table.getState().sorting.length > 1
  const active = filter !== undefined && isFilterActive(filter)
  const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  const ariaSort =
    sortIndex === 0 ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined) : undefined

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        'sticky top-0 z-20 h-10 border-b bg-muted p-0 text-left font-medium',
        pinned && 'left-0 z-30 border-r',
      )}
    >
      <div className="flex h-full items-center gap-0.5 pr-1">
        <button
          type="button"
          onClick={column.getToggleSortingHandler()}
          title="Sort (shift-click to add a secondary sort)"
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 text-left outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <span className="truncate">{info.label}</span>
          <SortIcon
            className={cn('size-3.5 shrink-0', !sorted && 'text-muted-foreground/60')}
            aria-hidden="true"
          />
          {sorted && multiSort && (
            <span className="text-xs text-muted-foreground tabular-nums">{sortIndex + 1}</span>
          )}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={active ? 'secondary' : 'ghost'}
              size="icon-xs"
              aria-label={active ? `Filter ${info.label} (active)` : `Filter ${info.label}`}
              className={cn(active && 'text-primary ring-1 ring-primary/40')}
            >
              <ListFilter aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80" aria-label={`Filter ${info.label}`}>
            <ColumnFilterEditor info={info} filter={filter} facets={facets} onChange={onFilterChange} />
          </PopoverContent>
        </Popover>
      </div>
    </th>
  )
}
