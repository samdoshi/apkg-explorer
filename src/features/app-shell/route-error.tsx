import { isRouteErrorResponse, Link, useLocation, useNavigate, useRouteError } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isOpenedFromList } from '@/lib/opened-from-list'

/*
 * What's shown when a page or popup fails while it draws. Cards are built from the deck's own
 * HTML and templates as they're shown, so an unexpected file (or a bug) shouldn't take the
 * whole app down with it. Moving to another page clears the error.
 */

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${String(error.status)} ${error.statusText}`
  return error instanceof Error ? error.message : String(error)
}

/** In place of a page; the header (and the open file) stay. */
export function PageError() {
  const error = useRouteError()
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-4 py-12">
      <Alert variant="destructive">
        <AlertTitle>This page couldn’t be shown</AlertTitle>
        <AlertDescription>APKG Explorer ran into a problem: {errorMessage(error)}</AlertDescription>
      </Alert>
      <Button asChild variant="outline">
        <Link to="/">Go to the start page</Link>
      </Button>
    </div>
  )
}

/** In place of the note popup or the media preview, over the list it was opened from. */
export function PopupError({ noun }: { noun: 'note' | 'file' }) {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  const close = () => {
    // As the popups themselves do: Back if opened from the list, else up to the list.
    if (isOpenedFromList(location.state)) void navigate(-1)
    else void navigate({ pathname: '..', search: location.search }, { replace: true })
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Couldn’t show this {noun}</DialogTitle>
          <DialogDescription>APKG Explorer ran into a problem: {errorMessage(error)}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
