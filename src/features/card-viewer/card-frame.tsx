import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { FrameDocument } from './card-document'

/** Keys the popup handles even while focus is inside a card (e.g. after clicking it). */
const FORWARDED_KEYS = new Set(['Escape', '[', ']'])

type FrameMessage = { token: string; type: 'ready' } | { token: string; type: 'key'; key: string }

function isFrameMessage(data: unknown): data is FrameMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'token' in data &&
    typeof data.token === 'string' &&
    'type' in data &&
    (data.type === 'ready' || (data.type === 'key' && 'key' in data && typeof data.key === 'string'))
  )
}

interface CardFrameProps {
  frame: FrameDocument
  title: string
  onKey: (key: string) => void
  className?: string
}

/** One sandboxed card document (see card-document.ts). */
export function CardFrame({ frame, title, onKey, className }: CardFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null)
  const handleKey = useEffectEvent(onKey)

  // A layout effect, so the listeners are in place before the frame's document loads.
  useLayoutEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const { token, payload } = frame

    // Frames that run scripts have an opaque origin: they talk to us by postMessage,
    // and we only answer our own frame, and only with the right token.
    const onMessage = (event: MessageEvent) => {
      const target = iframe.contentWindow
      if (!target || event.source !== target || !isFrameMessage(event.data) || event.data.token !== token) return
      if (event.data.type === 'ready' && payload) {
        target.postMessage({ token, type: 'render', html: payload.html, media: payload.media }, '*')
      } else if (event.data.type === 'key') {
        handleKey(event.data.key)
      }
    }

    // Frames without scripts share our origin, so we can listen to their keys directly.
    const onFrameKey = (event: KeyboardEvent) => {
      if (!FORWARDED_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      handleKey(event.key)
    }
    let frameDocument: Document | null = null
    const onLoad = () => {
      if (payload) return
      frameDocument = iframe.contentDocument
      frameDocument?.addEventListener('keydown', onFrameKey)
    }

    window.addEventListener('message', onMessage)
    iframe.addEventListener('load', onLoad)
    return () => {
      window.removeEventListener('message', onMessage)
      iframe.removeEventListener('load', onLoad)
      frameDocument?.removeEventListener('keydown', onFrameKey)
    }
  }, [frame])

  return (
    <iframe
      ref={ref}
      key={frame.token}
      title={title}
      sandbox={frame.sandbox}
      srcDoc={frame.srcdoc}
      className={cn('block size-full rounded-lg border bg-white dark:bg-[#2c2c2c]', className)}
    />
  )
}
