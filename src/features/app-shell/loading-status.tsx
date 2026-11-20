import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

export type LoadingState = { status: 'loading' } | { status: 'failed'; message: string }

/** Where a list or note will be: a spinner while it loads, or why it couldn't be. */
export function LoadingStatus({ state, loading, failed }: { state: LoadingState; loading: string; failed: string }) {
  return (
    <div className="flex flex-1 items-start justify-center p-8">
      {state.status === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" role="presentation" />
          {loading}
        </p>
      ) : (
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>{failed}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
