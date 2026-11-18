import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { normalizeForSearch } from '@/lib/search'
import type { ColumnInfo } from './columns'
import type { ColumnFilter, DateFilter, DecksFilter, RangeFilter, TagsFilter, TextFilter } from './filters'

export interface Facet {
  value: string
  count: number
}

export interface Facets {
  tags: Facet[]
  decks: Facet[]
  untaggedCount: number
}

interface EditorProps {
  info: ColumnInfo
  filter: ColumnFilter | undefined
  facets: Facets
  onChange: (filter: ColumnFilter | null) => void
}

/** The body of a column's filter popover. Changes apply immediately. */
export function ColumnFilterEditor({ info, filter, facets, onChange }: EditorProps) {
  switch (info.kind) {
    case 'field':
      return (
        <TextEditor
          label={info.label}
          filter={filter?.kind === 'text' ? filter : undefined}
          onChange={onChange}
        />
      )
    case 'tags':
      return (
        <TagsEditor
          filter={filter?.kind === 'tags' ? filter : undefined}
          facets={facets}
          onChange={onChange}
        />
      )
    case 'decks':
      return (
        <DecksEditor
          filter={filter?.kind === 'decks' ? filter : undefined}
          facets={facets.decks}
          onChange={onChange}
        />
      )
    case 'cards':
      return (
        <RangeEditor
          label={info.label}
          filter={filter?.kind === 'range' ? filter : undefined}
          onChange={onChange}
        />
      )
    case 'date':
      return (
        <DateEditor
          label={info.label}
          filter={filter?.kind === 'date' ? filter : undefined}
          onChange={onChange}
        />
      )
  }
}

function ClearButton({ onClear, disabled }: { onClear: () => void; disabled: boolean }) {
  return (
    <Button variant="ghost" size="sm" className="self-end" disabled={disabled} onClick={onClear}>
      Clear filter
    </Button>
  )
}

function TextEditor({
  label,
  filter,
  onChange,
}: {
  label: string
  filter: TextFilter | undefined
  onChange: (filter: ColumnFilter | null) => void
}) {
  const inputId = useId()
  const op = filter?.op ?? 'contains'
  const value = filter?.op === 'contains' ? filter.value : ''
  const setOp = (next: string) => {
    if (next === 'contains') onChange({ kind: 'text', op: 'contains', value })
    else if (next === 'empty' || next === 'not-empty') onChange({ kind: 'text', op: next })
  }
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={op}
        onValueChange={setOp}
        aria-label={`How to filter ${label}`}
      >
        <ToggleGroupItem value="contains">Contains</ToggleGroupItem>
        <ToggleGroupItem value="empty">Empty</ToggleGroupItem>
        <ToggleGroupItem value="not-empty">Not empty</ToggleGroupItem>
      </ToggleGroup>
      {op === 'contains' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>{label} contains</Label>
          <Input
            id={inputId}
            autoFocus
            value={value}
            onChange={(event) => {
              onChange({ kind: 'text', op: 'contains', value: event.target.value })
            }}
          />
        </div>
      )}
      <ClearButton disabled={!filter} onClear={() => { onChange(null) }} />
    </div>
  )
}

const MAX_CHECKLIST_ITEMS = 200

function Checklist({
  label,
  facets,
  selected,
  onToggle,
}: {
  label: string
  facets: Facet[]
  selected: string[]
  onToggle: (value: string, checked: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const searchId = useId()
  const needle = normalizeForSearch(query.trim())
  const matches = needle
    ? facets.filter((facet) => normalizeForSearch(facet.value).includes(needle))
    : facets
  const shown = matches.slice(0, MAX_CHECKLIST_ITEMS)
  return (
    <div className="flex flex-col gap-2">
      {facets.length > 8 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={searchId}>Find {label.toLowerCase()}</Label>
          <Input
            id={searchId}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
            }}
          />
        </div>
      )}
      <ul aria-label={label} className="max-h-60 space-y-0.5 overflow-y-auto pr-1">
        {shown.map((facet) => (
          <ChecklistItem
            key={facet.value}
            facet={facet}
            checked={selected.includes(facet.value)}
            onToggle={onToggle}
          />
        ))}
        {shown.length === 0 && (
          <li className="py-2 text-sm text-muted-foreground">No matches</li>
        )}
      </ul>
      {matches.length > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {matches.length}. Type to narrow the list.
        </p>
      )}
    </div>
  )
}

function ChecklistItem({
  facet,
  checked,
  onToggle,
}: {
  facet: Facet
  checked: boolean
  onToggle: (value: string, checked: boolean) => void
}) {
  const id = useId()
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onToggle(facet.value, next === true)
        }}
      />
      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer font-normal break-words">
        {facet.value}
      </Label>
      <span className="text-xs text-muted-foreground tabular-nums">{facet.count}</span>
    </li>
  )
}

const toggleIn = (list: string[], value: string, on: boolean) =>
  on ? [...list.filter((item) => item !== value), value] : list.filter((item) => item !== value)

function TagsEditor({
  filter,
  facets,
  onChange,
}: {
  filter: TagsFilter | undefined
  facets: Facets
  onChange: (filter: ColumnFilter | null) => void
}) {
  const untaggedId = useId()
  const current: TagsFilter = filter ?? { kind: 'tags', tags: [], match: 'any', untagged: false }
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={current.match}
        onValueChange={(match) => {
          if (match === 'any' || match === 'all') onChange({ ...current, match })
        }}
        aria-label="Match"
      >
        <ToggleGroupItem value="any">Any of these</ToggleGroupItem>
        <ToggleGroupItem value="all">All of these</ToggleGroupItem>
      </ToggleGroup>
      {facets.tags.length > 0 ? (
        <Checklist
          label="Tags"
          facets={facets.tags}
          selected={current.tags}
          onToggle={(tag, on) => {
            onChange({ ...current, tags: toggleIn(current.tags, tag, on) })
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No note of this type has tags.</p>
      )}
      {facets.untaggedCount > 0 && (
        <div className="flex items-center gap-2 border-t px-1 pt-3">
          <Checkbox
            id={untaggedId}
            checked={current.untagged}
            onCheckedChange={(next) => {
              onChange({ ...current, untagged: next === true })
            }}
          />
          <Label htmlFor={untaggedId} className="flex-1 font-normal">
            Untagged
          </Label>
          <span className="text-xs text-muted-foreground tabular-nums">{facets.untaggedCount}</span>
        </div>
      )}
      <ClearButton disabled={!filter} onClear={() => { onChange(null) }} />
    </div>
  )
}

function DecksEditor({
  filter,
  facets,
  onChange,
}: {
  filter: DecksFilter | undefined
  facets: Facet[]
  onChange: (filter: ColumnFilter | null) => void
}) {
  const selected = filter?.decks ?? []
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Notes with a card in any of these decks:</p>
      <Checklist
        label="Decks"
        facets={facets}
        selected={selected}
        onToggle={(deck, on) => {
          onChange({ kind: 'decks', decks: toggleIn(selected, deck, on) })
        }}
      />
      <ClearButton disabled={!filter} onClear={() => { onChange(null) }} />
    </div>
  )
}

function parseCount(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null
}

function RangeEditor({
  label,
  filter,
  onChange,
}: {
  label: string
  filter: RangeFilter | undefined
  onChange: (filter: ColumnFilter | null) => void
}) {
  const minId = useId()
  const maxId = useId()
  const current: RangeFilter = filter ?? { kind: 'range', min: null, max: null }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={minId}>{label} at least</Label>
          <Input
            id={minId}
            type="number"
            min={0}
            inputMode="numeric"
            autoFocus
            value={current.min ?? ''}
            onChange={(event) => {
              onChange({ ...current, min: parseCount(event.target.value) })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={maxId}>{label} at most</Label>
          <Input
            id={maxId}
            type="number"
            min={0}
            inputMode="numeric"
            value={current.max ?? ''}
            onChange={(event) => {
              onChange({ ...current, max: parseCount(event.target.value) })
            }}
          />
        </div>
      </div>
      <ClearButton disabled={!filter} onClear={() => { onChange(null) }} />
    </div>
  )
}

function DateEditor({
  label,
  filter,
  onChange,
}: {
  label: string
  filter: DateFilter | undefined
  onChange: (filter: ColumnFilter | null) => void
}) {
  const fromId = useId()
  const toId = useId()
  const current: DateFilter = filter ?? { kind: 'date', from: '', to: '' }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fromId}>{label} from</Label>
          <Input
            id={fromId}
            type="date"
            autoFocus
            value={current.from}
            onChange={(event) => {
              onChange({ ...current, from: event.target.value })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={toId}>{label} to</Label>
          <Input
            id={toId}
            type="date"
            value={current.to}
            onChange={(event) => {
              onChange({ ...current, to: event.target.value })
            }}
          />
        </div>
      </div>
      <ClearButton disabled={!filter} onClear={() => { onChange(null) }} />
    </div>
  )
}
