import { describe, expect, it } from 'vitest'
import { deckAndParents, isInDeck } from './decks'

describe('decks', () => {
  it('lists a deck with the decks above it', () => {
    expect(deckAndParents('Japanese::Vocab::N5')).toEqual(['Japanese', 'Japanese::Vocab', 'Japanese::Vocab::N5'])
    expect(deckAndParents('Default')).toEqual(['Default'])
  })

  it('counts subdecks as in a deck, but not decks whose names only start the same', () => {
    expect(isInDeck('Japanese', 'Japanese')).toBe(true)
    expect(isInDeck('Japanese::Vocab', 'Japanese')).toBe(true)
    expect(isInDeck('Japanese 2', 'Japanese')).toBe(false)
    expect(isInDeck('Japanese', 'Japanese::Vocab')).toBe(false)
  })
})
