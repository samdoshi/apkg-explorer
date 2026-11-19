import { useEffectEvent, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { FrameDocument } from './card-document'

/** Keys the popup handles even while focus is inside a card (e.g. after clicking it); see the loader. */
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

  // A layout effect, so the listener is in place before the frame's loader starts.
  useLayoutEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    const { token, payload } = frame
    // The frame has an opaque origin, so it talks to us by postMessage. We only answer our
    // own frame, and only with the right token.
    const onMessage = (event: MessageEvent) => {
      const target = iframe.contentWindow
      if (!target || event.source !== target || !isFrameMessage(event.data) || event.data.token !== token) return
      if (event.data.type === 'ready') {
        target.postMessage({ token, type: 'render', html: payload.html, media: payload.media }, '*')
      } else if (FORWARDED_KEYS.has(event.data.key)) {
        handleKey(event.data.key)
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [frame])

  return (
    <iframe
      ref={ref}
      key={frame.token}
      title={title}
      sandbox={frame.sandbox}
      // A video's full-screen button; a frame with its own origin only gets it when asked.
      allow="fullscreen"
      srcDoc={frame.srcdoc}
      className={cn('block size-full rounded-lg border bg-white dark:bg-[#2c2c2c]', className)}
    />
  )
}
