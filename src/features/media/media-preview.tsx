import { Download } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ListPopup } from '@/features/app-shell/list-popup'
import { useListPopup } from '@/features/app-shell/use-list-popup'
import { canPlay } from '@/features/card-viewer/can-play'
import { mimeTypeFor } from '@/features/package/mime'
import type { PackageClient } from '@/features/package/package-client'
import { usePackage } from '@/features/package/package-context'
import { formatBytes } from '@/lib/format'
import { FontView } from './font-view'
import { kindInfo } from './kinds'
import type { MediaPreviewContext } from './media-preview-context'
import { extensionLabel, mediaPath, type MediaRow } from './media-rows'
import { useMediaFile } from './use-media-file'

/** #/media/:name, shown over the media list. */
export function MediaPreview() {
  const { state } = usePackage()
  const { name = '' } = useParams()
  const context = useOutletContext<MediaPreviewContext>()
  const popup = useListPopup({
    items: context.orderedNames,
    current: name,
    noun: 'file',
    listPath: '/media',
    itemPath: mediaPath,
  })
  if (state.status !== 'ready') return null

  const file = context.rowFor(name)
  const details = file ? [kindInfo[file.kind].label, extensionLabel(file.name), file.size === null ? null : formatBytes(file.size)] : []

  return (
    // A fixed height from sm up, so Previous and Next stay put. Long names wrap (the list
    // truncates them).
    <ListPopup
      popup={popup}
      title={name}
      wrapTitle
      details={details}
      className="sm:h-[min(88dvh,44rem)] sm:max-w-[min(56rem,calc(100%-2rem))]"
      onClosed={() => {
        context.onClosed(name)
      }}
    >
      {file ? (
        <PreviewBody key={name} client={state.client} file={file} />
      ) : (
        <Message>This file isn’t in the open package’s media list.</Message>
      )}
    </ListPopup>
  )
}

function PreviewBody({ client, file }: { client: PackageClient; file: MediaRow }) {
  const media = useMediaFile(client, file.name)
  // Set by the image viewer once the image has loaded.
  const [dimensions, setDimensions] = useState<string | null>(null)

  if (media.status === 'loading') {
    return (
      <Message>
        <Spinner aria-hidden="true" role="presentation" />
        Reading {file.name}…
      </Message>
    )
  }
  if (media.status === 'failed') {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Couldn’t read this file</AlertTitle>
          <AlertDescription>{media.message}</AlertDescription>
        </Alert>
      </div>
    )
  }
  if (media.status === 'missing') {
    return <Message>This file is in the package’s media list, but the file itself is missing.</Message>
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-4">
        {file.kind === 'image' ? (
          <ImageView name={file.name} url={media.url} onDimensions={setDimensions} />
        ) : file.kind === 'audio' || file.kind === 'video' ? (
          <PlayerView name={file.name} kind={file.kind} url={media.url} />
        ) : file.kind === 'font' ? (
          <FontView name={file.name} blob={media.blob} />
        ) : isText(file.name) ? (
          <TextView name={file.name} blob={media.blob} />
        ) : (
          <p className="text-sm text-muted-foreground">There’s no preview for this kind of file.</p>
        )}
      </div>
      <footer className="flex items-center gap-3 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">{dimensions}</p>
        <Button asChild size="sm" className="ml-auto">
          {/* A normal browser download of the file's object URL; nothing is cached. */}
          <a href={media.url} download={file.name}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Download
          </a>
        </Button>
      </footer>
    </>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

/** SVGs too: an <img> never runs scripts inside them. */
function ImageView({
  name,
  url,
  onDimensions,
}: {
  name: string
  url: string
  onDimensions: (dimensions: string | null) => void
}) {
  const [broken, setBroken] = useState(false)
  if (broken) return <p className="text-sm text-muted-foreground">This browser can’t show this image.</p>
  return (
    <img
      src={url}
      alt={name}
      className="checkerboard max-h-full min-h-0 max-w-full rounded-sm object-contain ring-1 ring-foreground/10"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget
        // An SVG without a size of its own reports one the browser made up.
        const raster = mimeTypeFor(name) !== 'image/svg+xml'
        onDimensions(raster && naturalWidth > 0 ? `${String(naturalWidth)} × ${String(naturalHeight)} pixels` : null)
      }}
      onError={() => {
        setBroken(true)
      }}
    />
  )
}

function PlayerView({ name, kind, url }: { name: string; kind: 'audio' | 'video'; url: string }) {
  const [failed, setFailed] = useState(false)
  const extension = extensionLabel(name)
  if (!canPlay(name) || failed) {
    return (
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        This browser can’t play {extension === 'No extension' ? 'this file' : `${extension} files`}. Download it to
        play it in another app.
      </p>
    )
  }
  const onError = () => {
    setFailed(true)
  }
  return kind === 'audio' ? (
    <audio controls src={url} aria-label={`Audio player for ${name}`} className="w-full max-w-md" onError={onError} />
  ) : (
    <video
      controls
      src={url}
      aria-label={`Video player for ${name}`}
      className="max-h-full min-h-0 max-w-full rounded-sm bg-black"
      onError={onError}
    />
  )
}

function isText(name: string): boolean {
  const type = mimeTypeFor(name)
  return type.startsWith('text/') || type === 'application/json'
}

const SHOWN_BYTES = 256 * 1024

/** Text files (scripts, CSS, JSON…): the first part of the file, as plain text. */
function TextView({ name, blob }: { name: string; blob: Blob }) {
  const [read, setRead] = useState<{ blob: Blob; text: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    blob
      .slice(0, SHOWN_BYTES)
      .text()
      .then(
        (text) => {
          if (!cancelled) setRead({ blob, text })
        },
        () => {
          if (!cancelled) setRead({ blob, text: null })
        },
      )
    return () => {
      cancelled = true
    }
  }, [blob])

  if (read?.blob !== blob) return <Spinner aria-label={`Reading ${name}`} />
  if (read.text === null) return <p className="text-sm text-muted-foreground">Couldn’t read this file as text.</p>
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 self-stretch">
      {/* Focusable so it can be scrolled from the keyboard. */}
      <pre
        tabIndex={0}
        aria-label={`Contents of ${name}`}
        className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <code>{read.text || '(empty)'}</code>
      </pre>
      {blob.size > SHOWN_BYTES && (
        <p className="text-xs text-muted-foreground">
          Showing the first {formatBytes(SHOWN_BYTES)} of {formatBytes(blob.size)}.
        </p>
      )}
    </div>
  )
}
