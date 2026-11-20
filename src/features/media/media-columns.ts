import type { ColumnDef } from '@tanstack/react-table'
import { compareText } from '@/lib/format'
import { MEDIA_KINDS, type MediaRow } from './media-rows'

/** Sorting only: media-table.tsx draws the cells. */
export const mediaColumns: ColumnDef<MediaRow>[] = [
  {
    id: 'name',
    header: 'Name',
    accessorFn: (row) => row.name,
    sortingFn: (a, b) => compareText(a.original.name, b.original.name),
  },
  { id: 'kind', header: 'Kind', accessorFn: (row) => MEDIA_KINDS.indexOf(row.kind), sortingFn: 'basic' },
  {
    id: 'size',
    header: 'Size',
    accessorFn: (row) => row.size ?? undefined,
    sortingFn: 'basic',
    sortUndefined: 'last',
  },
]
