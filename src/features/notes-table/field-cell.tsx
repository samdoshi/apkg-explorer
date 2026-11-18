import { Film, Image, Volume2 } from 'lucide-react'
import type { MediaRef } from '@/features/package/html-text'

const mediaIcons = { image: Image, audio: Volume2, video: Film }

/** A field's text followed by its media files, on one truncated line. */
export function FieldCell({ text, media }: { text: string; media: MediaRef[] | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {text && <span className="truncate">{text}</span>}
      {media?.map((ref, index) => {
        const Icon = mediaIcons[ref.kind]
        return (
          <span
            key={`${ref.name}-${String(index)}`}
            className="flex min-w-0 shrink items-center gap-1 text-muted-foreground"
          >
            <Icon className="size-3.5 shrink-0" aria-label={ref.kind} />
            <span className="truncate">{ref.name}</span>
          </span>
        )
      })}
    </span>
  )
}
