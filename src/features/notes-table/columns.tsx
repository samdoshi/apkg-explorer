import type { ColumnDef, SortingFn } from '@tanstack/react-table'
import type { NoteRow } from '@/features/package/note-row'
import { FieldCell } from './field-cell'
import { fieldColumnId, fieldValue, type ColumnId } from './filters'

export type ColumnKind = 'field' | 'tags' | 'decks' | 'cards' | 'date'

export interface ColumnInfo {
  id: ColumnId
  label: string
  kind: ColumnKind
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const numberFormat = new Intl.NumberFormat()

const textSort: SortingFn<NoteRow> = (a, b, columnId) =>
  collator.compare(a.getValue<string>(columnId), b.getValue<string>(columnId))

/** Text used for a cell's tooltip, so truncated content can still be read. */
export function cellTitle(row: NoteRow, info: ColumnInfo, fieldIndex: number | null): string {
  switch (info.kind) {
    case 'field': {
      const index = fieldIndex ?? 0
      const media = (row.media[index] ?? []).map((ref) => ref.name)
      return [row.fields[index] ?? '', ...media].filter(Boolean).join(' · ')
    }
    case 'tags':
      return row.tags.join(' ')
    case 'decks':
      return row.decks.join(', ')
    default:
      return ''
  }
}

export function buildColumns(fieldNames: string[]): {
  columns: ColumnDef<NoteRow>[]
  info: Map<string, ColumnInfo>
} {
  const info = new Map<string, ColumnInfo>()
  const columns: ColumnDef<NoteRow>[] = fieldNames.map((name, index) => {
    const id = fieldColumnId(index)
    info.set(id, { id, label: name, kind: 'field' })
    return {
      id,
      header: name,
      accessorFn: (row) => fieldValue(row, index) || undefined,
      sortingFn: textSort,
      sortUndefined: 'last',
      size: index === 0 ? 240 : 220,
      cell: ({ row }) => (
        <FieldCell text={row.original.fields[index] ?? ''} media={row.original.media[index]} />
      ),
    }
  })

  const fixed: (ColumnDef<NoteRow> & { id: ColumnId })[] = [
    {
      id: 'tags',
      header: 'Tags',
      accessorFn: (row) => row.tags.join(' ') || undefined,
      sortingFn: textSort,
      sortUndefined: 'last',
      size: 180,
      cell: ({ row }) => <span className="truncate">{row.original.tags.join(' ')}</span>,
    },
    {
      id: 'decks',
      header: 'Deck',
      accessorFn: (row) => row.decks.join(', ') || undefined,
      sortingFn: textSort,
      sortUndefined: 'last',
      size: 200,
      cell: ({ row }) => <span className="truncate">{row.original.decks.join(', ')}</span>,
    },
    {
      id: 'cards',
      header: 'Cards',
      accessorFn: (row) => row.cardCount,
      sortingFn: 'basic',
      size: 96,
      cell: ({ row }) => (
        <span className="w-full text-right tabular-nums">
          {numberFormat.format(row.original.cardCount)}
        </span>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      accessorFn: (row) => row.created,
      sortingFn: 'basic',
      size: 136,
      cell: ({ row }) => <span className="truncate">{dateFormat.format(row.original.created)}</span>,
    },
    {
      id: 'modified',
      header: 'Modified',
      accessorFn: (row) => row.modified,
      sortingFn: 'basic',
      size: 136,
      cell: ({ row }) => <span className="truncate">{dateFormat.format(row.original.modified)}</span>,
    },
  ]
  const kinds: Record<string, ColumnKind> = {
    tags: 'tags',
    decks: 'decks',
    cards: 'cards',
    created: 'date',
    modified: 'date',
  }
  for (const column of fixed) {
    info.set(column.id, { id: column.id, label: String(column.header), kind: kinds[column.id] ?? 'field' })
  }
  return { columns: [...columns, ...fixed], info }
}
