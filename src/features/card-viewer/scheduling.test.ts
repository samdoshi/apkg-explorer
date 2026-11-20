import { describe, expect, it } from 'vitest'
import type { CardDetail } from '@/features/package/note-detail'
import { formatDate } from '@/lib/format'
import { describeCard } from './scheduling'

const DAY = 86_400_000
const CREATED = Date.UTC(2024, 0, 1)

function card(changes: Partial<CardDetail>): CardDetail {
  return {
    id: 1,
    ord: 0,
    deckName: 'Spanish',
    filteredDeckName: null,
    type: 0,
    queue: 0,
    due: 1,
    interval: 0,
    factor: 0,
    reps: 0,
    lapses: 0,
    flag: 0,
    ...changes,
  }
}

describe('describeCard', () => {
  it('gives a new card only its deck and state', () => {
    expect(describeCard(card({}), CREATED)).toEqual([
      ['Deck', 'Spanish'],
      ['State', 'New'],
    ])
  })

  it('counts a review card’s due date in days from the collection’s creation', () => {
    const review = card({ type: 2, queue: 2, due: 40, interval: 12, factor: 2500, reps: 5, lapses: 1 })
    expect(describeCard(review, CREATED)).toEqual([
      ['Deck', 'Spanish'],
      ['State', 'Review'],
      ['Due', formatDate(CREATED + 40 * DAY)],
      ['Interval', '12 days'],
      ['Ease', '250%'],
      ['Reviews', '5'],
      ['Lapses', '1'],
    ])
  })

  it('reads a learning card’s due date as a timestamp', () => {
    const due = Date.UTC(2024, 5, 1) / 1000
    const items = describeCard(card({ type: 1, queue: 1, due, reps: 1 }), CREATED)
    expect(items).toContainEqual(['Due', formatDate(due * 1000)])
    expect(items).toContainEqual(['State', 'Learning'])
  })

  it('shows suspended and buried cards as such, whatever their type', () => {
    expect(describeCard(card({ type: 2, queue: -1 }), CREATED)).toContainEqual(['State', 'Suspended'])
    expect(describeCard(card({ type: 2, queue: -2 }), CREATED)).toContainEqual(['State', 'Buried'])
    expect(describeCard(card({ type: 3, queue: -3 }), CREATED)).toContainEqual(['State', 'Buried'])
  })

  it('names the filtered deck a card sits in, after its home deck', () => {
    const items = describeCard(card({ filteredDeckName: 'Cram' }), CREATED)
    expect(items.slice(0, 2)).toEqual([
      ['Deck', 'Spanish'],
      ['Filtered deck', 'Cram'],
    ])
  })

  it('names the flag colour', () => {
    expect(describeCard(card({ flag: 1 }), CREATED)).toContainEqual(['Flag', 'Red'])
    expect(describeCard(card({ flag: 7 }), CREATED)).toContainEqual(['Flag', 'Purple'])
  })
})
