import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

interface VirtualRowsOptions {
  count: number
  scrollRef: RefObject<HTMLElement | null>
  rowHeight: number
  /** Height of the sticky header row the rows scroll under. */
  headerHeight: number
  /** Enter on the focused row. */
  onOpen: (index: number) => void
}

/**
 * Virtual rows for a table that has one focusable row at a time (a roving tabindex).
 * Arrow keys, Page Up/Down, Home and End move the focus, scrolling the row into view
 * (and so rendering it) first. Render `paddingTop` and `paddingBottom` as spacer rows
 * around `items`, give each row `data-index`, and put `onKeyDown` on the <tbody>.
 */
export function useVirtualRows({ count, scrollRef, rowHeight, headerHeight, onOpen }: VirtualRowsOptions) {
  const [activeIndex, setActiveIndex] = useState(0)
  const pendingFocus = useRef<number | null>(null)
  const current = Math.min(activeIndex, Math.max(count - 1, 0))

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    paddingStart: headerHeight,
    scrollPaddingStart: headerHeight,
  })
  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length ? (items[0]?.start ?? 0) - headerHeight : 0
  const paddingBottom = items.length ? virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0) : 0

  /** Focuses the pending row if it's rendered; false if it isn't (yet). */
  function focusPending(): boolean {
    if (pendingFocus.current === null) return true
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${String(pendingFocus.current)}"]`)
    if (!row) return false
    row.focus({ preventScroll: true })
    pendingFocus.current = null
    return true
  }

  // A row scrolled into view by keyboard navigation gets focus once it's rendered.
  useEffect(() => {
    focusPending()
  })

  /** Scrolls to a row and focuses it. */
  function moveTo(index: number) {
    if (count === 0) return
    const next = Math.max(0, Math.min(count - 1, index))
    setActiveIndex(next)
    pendingFocus.current = next
    virtualizer.scrollToIndex(next)
    // Already rendered (e.g. the row a popup was opened from): focus it now, as
    // nothing may re-render to run the effect above.
    focusPending()
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === 'Enter') {
      if (count > 0) {
        event.preventDefault()
        onOpen(current)
      }
      return
    }
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) - 1)
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      PageDown: current + page,
      PageUp: current - page,
      Home: 0,
      End: count - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    moveTo(target)
  }

  return { items, paddingTop, paddingBottom, current, setActiveIndex, moveTo, onKeyDown }
}
