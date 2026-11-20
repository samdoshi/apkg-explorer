import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { ListPopupState } from './use-list-popup'

interface ListPopupProps {
  popup: ListPopupState
  title: string
  /** Long titles wrap (file names) or are cut short with the rest in a tooltip (note text). */
  wrapTitle?: boolean
  /** Shown under the title, before the position, joined with " · ". */
  details: (string | null)[]
  /** The popup's size from sm up; on phones it fills the screen. */
  className: string
  /** After it has closed, e.g. to focus the item's row. */
  onClosed: () => void
  children: ReactNode
}

/** The dialog shared by the note popup and the media preview: title, Previous / Next, keys. */
export function ListPopup({ popup, title, wrapTitle = false, details, className, onClosed, children }: ListPopupProps) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.key !== '[' && event.key !== ']')) return
    const { target } = event
    // Keys in a dialog opened from this one (e.g. "View scripts") bubble here through
    // React's tree; they aren't for us. Nor are brackets typed into a text box.
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return
    event.preventDefault()
    popup.handleKey(event.key)
  }
  const label = (direction: string) => `${direction} ${popup.noun}`

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) popup.close()
      }}
    >
      <DialogContent
        className={cn(
          'flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 rounded-none p-0 sm:rounded-xl',
          className,
        )}
        onKeyDown={onKeyDown}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onClosed()
        }}
      >
        <header className={cn('flex gap-2 border-b py-3 pr-14 pl-4', wrapTitle ? 'items-start' : 'items-center')}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle
              className={cn('text-base', wrapTitle ? 'wrap-anywhere' : 'truncate')}
              title={wrapTitle ? undefined : title}
            >
              {title}
            </DialogTitle>
            <DialogDescription className={cn('text-xs', !wrapTitle && 'truncate')}>
              {[...details, popup.position].filter(Boolean).join(' · ')}
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label('Previous')}
            aria-keyshortcuts="["
            title={`${label('Previous')} ( [ )`}
            disabled={!popup.hasPrevious}
            onClick={() => {
              popup.handleKey('[')
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label('Next')}
            aria-keyshortcuts="]"
            title={`${label('Next')} ( ] )`}
            disabled={!popup.hasNext}
            onClick={() => {
              popup.handleKey(']')
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </header>
        {children}
      </DialogContent>
    </Dialog>
  )
}
