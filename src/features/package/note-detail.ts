/** One card of a note, with its scheduling as exported. Plain data, sent from the worker. */
export interface CardDetail {
  id: number
  /** Template index; for cloze note types, the cloze number minus one. */
  ord: number
  /** The card's home deck (its original deck if it sits in a filtered deck). */
  deckName: string
  /** The filtered deck the card sits in, if any. */
  filteredDeckName: string | null
  /** 0 new, 1 learning, 2 review, 3 relearning. */
  type: number
  /** 0 new, 1 learning, 2 review, 3 day learning, 4 preview, -1 suspended, -2/-3 buried. */
  queue: number
  /**
   * New: position. Review and day learning: days since the collection was created. Learning:
   * epoch seconds. For a card in a filtered deck, the due date it had in its home deck.
   */
  due: number
  /** Days (negative: seconds, for learning cards). */
  interval: number
  /** Ease in permille (2500 = 250%); 0 when unknown. */
  factor: number
  reps: number
  lapses: number
  /** Flag colour 0-7 (0 = none). */
  flag: number
}

/** Everything needed to render one note's cards. */
export interface NoteDetail {
  id: number
  noteTypeId: number
  /** Raw field HTML, in field order. */
  fields: string[]
  tags: string[]
  /** Creation time (ms since epoch). */
  created: number
  /** Last modified time (ms since epoch). */
  modified: number
  /** Cards in template / cloze order. */
  cards: CardDetail[]
}
