/**
 * Location state for a popup opened from a list (the notes table, the media list), so
 * closing it can go Back instead of adding another history entry.
 */
export interface OpenedFromList {
  fromList: true
}

export const openedFromList: OpenedFromList = { fromList: true }

export function isOpenedFromList(state: unknown): state is OpenedFromList {
  return typeof state === 'object' && state !== null && 'fromList' in state && state.fromList === true
}
