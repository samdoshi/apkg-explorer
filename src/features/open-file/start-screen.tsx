import { ArrowRight, FileArchive, FolderOpen, ShieldCheck, Sparkles } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { usePackage } from '@/features/package/package-context'
import sampleUrl from '../../../fixtures/sample.apkg?url'
import { useOpenPackage } from './use-open-package'

export function StartScreen() {
  const { state } = usePackage()
  const openPackage = useOpenPackage()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [loadingSample, setLoadingSample] = useState(false)
  const [sampleError, setSampleError] = useState(false)
  const busy = loadingSample || state.status === 'opening'

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input so choosing the same file again still triggers a change.
    event.target.value = ''
    if (file) {
      setSampleError(false)
      await openPackage(file)
    }
  }

  async function openSample() {
    setLoadingSample(true)
    setSampleError(false)
    try {
      const response = await fetch(sampleUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const file = new File([await response.blob()], 'sample.apkg')
      setLoadingSample(false)
      await openPackage(file)
    } catch {
      setLoadingSample(false)
      setSampleError(true)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-10 sm:py-16">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Look inside an Anki deck
        </h1>
        <p className="text-pretty text-muted-foreground">
          Browse the notes, cards and media in an <code className="font-mono">.apkg</code> or{' '}
          <code className="font-mono">.colpkg</code> file.
        </p>
      </div>

      {state.status === 'ready' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <p className="min-w-0 text-sm">
            <span className="text-muted-foreground">Open now: </span>
            <span className="font-medium break-all">{state.summary.fileName}</span>
          </p>
          <Button asChild size="sm">
            <Link to="/notes">
              View notes
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      <section
        aria-labelledby="open-file-heading"
        className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-8 text-center sm:p-10"
      >
        <FileArchive className="size-10 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 id="open-file-heading" className="font-medium">
            Open a deck
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose a file, or drop one anywhere on this page.
          </p>
        </div>
        {/* No `accept` filter: mobile browsers don't know the .apkg type and may grey files out. */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void handleFileChosen(event)}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button disabled={busy} onClick={() => inputRef.current?.click()}>
            <FolderOpen data-icon="inline-start" aria-hidden="true" />
            Open file…
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void openSample()}>
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            Try a sample deck
          </Button>
        </div>
      </section>

      <div aria-live="polite" className="empty:hidden">
        {(loadingSample || state.status === 'opening') && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner aria-hidden="true" role="presentation" />
            {loadingSample ? 'Loading the sample deck…' : `Opening ${state.status === 'opening' ? state.fileName : ''}…`}
          </p>
        )}
        {state.status === 'failed' && !busy && (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t open {state.fileName}</AlertTitle>
            <AlertDescription>{state.error.message}</AlertDescription>
          </Alert>
        )}
        {sampleError && !busy && (
          <Alert variant="destructive">
            <AlertTitle>Couldn’t load the sample deck</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        )}
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        Your file stays on this device. Nothing is uploaded or saved.
      </p>
    </div>
  )
}
