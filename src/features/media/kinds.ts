import { File, Film, Image, Volume2, type LucideIcon } from 'lucide-react'
import type { MediaKind } from '@/features/package/mime'

export const kindInfo: Record<MediaKind, { label: string; plural: string; icon: LucideIcon }> = {
  image: { label: 'Image', plural: 'Images', icon: Image },
  audio: { label: 'Audio', plural: 'Audio', icon: Volume2 },
  video: { label: 'Video', plural: 'Video', icon: Film },
  other: { label: 'Other', plural: 'Other', icon: File },
}
