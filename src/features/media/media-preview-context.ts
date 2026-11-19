import type { MediaRow } from './media-rows'

/** What the media list passes to the preview dialog through its <Outlet>. */
export interface MediaPreviewContext {
  /** File names in the list's current order, after search and the kind filter. */
  orderedNames: readonly string[]
  /** The list's row for a file. */
  rowFor: (name: string) => MediaRow | undefined
  /** Called as the preview closes, with the file it was showing. */
  onClosed: (name: string) => void
}
