import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { toPackageError } from '@/features/package/errors'
import type { PackageClient } from '@/features/package/package-client'
import { usePackage } from '@/features/package/package-context'
import { formatBytes } from '@/lib/format'
import { useContentPermissions } from './content-permissions'
import type { ContentReport, ScriptFinding, WebFinding } from './sanitize'

export type DetailsView = 'scripts' | 'web'

const SANDBOX_NOTE =
  'They run in a sandbox, away from this app, your file and other cards, but they can change what a card shows and could send what’s in it to a website.'

function explanation(view: DetailsView, allowed: boolean): string {
  if (view === 'scripts') {
    return allowed
      ? `Scripts are allowed for every card in this file. ${SANDBOX_NOTE}`
      : `Scripts are blocked, so none of this has run. If you allow them, they run in every card of this file, not just this one. ${SANDBOX_NOTE}`
  }
  return allowed
    ? 'Web content is allowed for every card in this file. These sites see your IP address and what was requested.'
    : 'Nothing has been downloaded. If you allow web content, every card in this file can load from these sites, and the sites see your IP address and what was requested.'
}

interface ContentDetailsProps {
  view: DetailsView
  report: ContentReport
  noun: 'card' | 'note'
  /** The button that opens the list; focus returns to it when the list closes. */
  children: ReactNode
}

/**
 * Lists a card's scripts or web addresses, so the choice to allow them is an informed
 * one. Addresses are shown as text, not links: nothing here loads anything from the web.
 */
export function ContentDetails({ view, report, noun, children }: ContentDetailsProps) {
  const permissions = useContentPermissions()
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Radix lets only the top dialog handle Escape, but the note popup underneath learns it
  // is no longer on top a render after this opens; an Escape in that moment would close
  // both. So this list handles its own Escape before Radix sees it.
  useLayoutEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const inside = event.target instanceof Node && contentRef.current?.contains(event.target)
      if (event.key !== 'Escape' || !inside) return
      event.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [open])
  const allowed = view === 'web' ? permissions.web : permissions.scripts
  const action = `${allowed ? 'Block' : 'Allow'} ${view === 'web' ? 'web content' : 'scripts'}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent ref={contentRef} showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{view === 'web' ? `Web content in this ${noun}` : `Scripts in this ${noun}`}</DialogTitle>
          <DialogDescription>{explanation(view, allowed)}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 overflow-y-auto px-6">
          {view === 'web' ? <WebList findings={report.web} /> : <ScriptList findings={report.scripts} />}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button
            variant={allowed ? 'outline' : 'default'}
            onClick={() => {
              if (view === 'web') permissions.setWeb(!allowed)
              else permissions.setScripts(!allowed)
              setOpen(false)
            }}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Where({ places }: { places: string[] }) {
  return (
    <span className="text-xs text-muted-foreground">
      <span className="sr-only">Found in: </span>
      {places.join(', ')}
    </span>
  )
}

function Code({ text, label }: { text: string; label: string }) {
  return (
    // Focusable so the code can be scrolled from the keyboard.
    <pre
      tabIndex={0}
      aria-label={label}
      className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <code>{text || '(empty)'}</code>
    </pre>
  )
}

function ScriptList({ findings }: { findings: ScriptFinding[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {findings.map((finding, index) => {
        const title =
          finding.type === 'code'
            ? finding.label
            : finding.type === 'file'
              ? `Script file ${finding.name}`
              : `Script from ${finding.host}`
        return (
          <li key={index} className="overflow-hidden rounded-lg border">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b bg-muted/50 px-3 py-2">
              <span className="font-medium break-all">{title}</span>
              <Where places={finding.where} />
            </div>
            {finding.type === 'code' && <Code text={finding.code} label={`Code of ${title}`} />}
            {finding.type === 'file' && <ScriptFile name={finding.name} />}
            {finding.type === 'web' && (
              <div className="flex flex-col gap-1 px-3 py-2 text-xs">
                <code className="font-mono break-all">{finding.url}</code>
                <p className="text-muted-foreground">Its code is on the web and hasn’t been downloaded.</p>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Script files can be big (a whole library); only the start is shown. */
const SHOWN_BYTES = 256 * 1024

type FileState =
  | { status: 'loading' }
  | { status: 'ready'; text: string; size: number }
  | { status: 'missing' }
  | { status: 'failed'; message: string }

/** A package script file's code, read from the file when the list is opened. */
function ScriptFile({ name }: { name: string }) {
  const { state } = usePackage()
  if (state.status !== 'ready') return null
  return <ScriptFileCode client={state.client} name={name} />
}

function ScriptFileCode({ client, name }: { client: PackageClient; name: string }) {
  const [file, setFile] = useState<FileState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    client
      .readMedia(name)
      .then(async (blob) => {
        if (!blob) return { status: 'missing' } as const
        return { status: 'ready', text: await blob.slice(0, SHOWN_BYTES).text(), size: blob.size } as const
      })
      .then(
        (next) => {
          if (!cancelled) setFile(next)
        },
        (error: unknown) => {
          if (!cancelled) setFile({ status: 'failed', message: toPackageError(error).message })
        },
      )
    return () => {
      cancelled = true
    }
  }, [client, name])

  if (file.status === 'loading') {
    return (
      <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Spinner aria-hidden="true" role="presentation" />
        Reading {name}…
      </p>
    )
  }
  if (file.status !== 'ready') {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {file.status === 'missing' ? 'This file isn’t in the package, so it can’t run.' : `Couldn’t read it: ${file.message}`}
      </p>
    )
  }
  return (
    <>
      <Code text={file.text} label={`Code of ${name}`} />
      {file.size > SHOWN_BYTES && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing the first {formatBytes(SHOWN_BYTES)} of {formatBytes(file.size)}.
        </p>
      )}
    </>
  )
}

function WebList({ findings }: { findings: WebFinding[] }) {
  const byHost = new Map<string, WebFinding[]>()
  for (const finding of findings) byHost.set(finding.host, [...(byHost.get(finding.host) ?? []), finding])
  const hosts = [...byHost.keys()].sort()
  return (
    <div className="flex flex-col gap-4">
      {hosts.map((host) => (
        <section key={host} className="flex flex-col gap-1.5">
          <h3 className="font-medium break-all">{host}</h3>
          <ul className="flex flex-col gap-1.5">
            {(byHost.get(host) ?? []).map((finding) => (
              <li key={`${finding.kind}\n${finding.url}`} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                <div className="flex flex-wrap justify-between gap-x-3 text-xs">
                  <span>{finding.kind}</span>
                  <Where places={finding.where} />
                </div>
                <code className="font-mono text-xs break-all">{finding.url}</code>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
