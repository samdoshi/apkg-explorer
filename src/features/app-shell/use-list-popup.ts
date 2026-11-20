import { useLocation, useNavigate } from 'react-router'
import { formatNumber } from '@/lib/format'
import { isOpenedFromList, openedFromList } from '@/lib/opened-from-list'

export interface ListPopupState {
  /** "note", "file": for the position and the Previous / Next labels. */
  noun: string
  /** "Note 3 of 120", or null when the item isn't in the list (e.g. filtered out). */
  position: string | null
  hasPrevious: boolean
  hasNext: boolean
  close: () => void
  /** Escape closes; [ and ] step to the previous and next item. */
  handleKey: (key: string) => void
}

interface Options<T> {
  /** The list's items in its current order. */
  items: readonly T[]
  current: T
  noun: string
  /** Where closing goes when the popup wasn't opened from the list (e.g. a link). */
  listPath: string
  itemPath: (item: T) => string
}

/**
 * A popup route over a list (the note popup, the media preview) that steps through the
 * list's current order. Opened from the list, closing goes Back; stepping replaces the
 * history entry, so Back still closes it however far you've stepped.
 */
export function useListPopup<T>({ items, current, noun, listPath, itemPath }: Options<T>): ListPopupState {
  const navigate = useNavigate()
  const location = useLocation()
  const fromList = isOpenedFromList(location.state)
  const index = items.indexOf(current)
  const previous = index > 0 ? items[index - 1] : undefined
  const next = index >= 0 ? items[index + 1] : undefined

  const close = () => {
    if (fromList) void navigate(-1)
    else void navigate(listPath, { replace: true })
  }
  const go = (target: T | undefined) => {
    if (target !== undefined) void navigate(itemPath(target), { replace: true, state: fromList ? openedFromList : null })
  }
  const capitalised = noun.charAt(0).toUpperCase() + noun.slice(1)
  return {
    noun,
    position: index >= 0 ? `${capitalised} ${formatNumber(index + 1)} of ${formatNumber(items.length)}` : null,
    hasPrevious: previous !== undefined,
    hasNext: next !== undefined,
    close,
    handleKey: (key) => {
      if (key === 'Escape') close()
      else if (key === '[') go(previous)
      else if (key === ']') go(next)
    },
  }
}
