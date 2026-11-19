import type { CardDetail } from '@/features/package/note-detail'
import { formatCount, formatDate } from '@/lib/format'

const DAY = 86_400_000
const FLAGS = ['', 'Red', 'Orange', 'Green', 'Blue', 'Pink', 'Turquoise', 'Purple']
const TYPES = ['New', 'Learning', 'Review', 'Relearning']

function state(card: CardDetail): string {
  if (card.queue === -1) return 'Suspended'
  if (card.queue === -2 || card.queue === -3) return 'Buried'
  return TYPES[card.type] ?? 'Unknown'
}

/** When the card is next due (ms), or null for new cards. */
function dueDate(card: CardDetail, collectionCreated: number): number | null {
  if (card.type === 0) return null
  // Intraday learning stores a timestamp; everything else counts days from the
  // collection's creation.
  return card.due > 1_000_000_000 ? card.due * 1000 : collectionCreated + card.due * DAY
}

/** The card's deck and, if the export kept scheduling, its review state, as label/value pairs. */
export function describeCard(card: CardDetail, collectionCreated: number): [string, string][] {
  const items: [string, string][] = [
    ['Deck', card.deckName],
    ['State', state(card)],
  ]
  const due = dueDate(card, collectionCreated)
  if (due !== null) items.push(['Due', formatDate(due)])
  if (card.interval > 0) items.push(['Interval', formatCount(card.interval, 'day')])
  if (card.factor > 0) items.push(['Ease', `${String(card.factor / 10)}%`])
  if (card.type !== 0 || card.reps > 0) {
    items.push(['Reviews', String(card.reps)], ['Lapses', String(card.lapses)])
  }
  const flag = FLAGS[card.flag]
  if (flag) items.push(['Flag', flag])
  return items
}
