/** What Anki puts between a deck's name and a subdeck's. */
const SEPARATOR = '::'

/** A deck and every deck above it: "A::B::C" gives ["A", "A::B", "A::B::C"]. */
export function deckAndParents(name: string): string[] {
  const parts = name.split(SEPARATOR)
  return parts.map((_, index) => parts.slice(0, index + 1).join(SEPARATOR))
}

/** Whether `deck` is the deck called `name` or one of its subdecks, as in Anki's `deck:` search. */
export function isInDeck(deck: string, name: string): boolean {
  return deck === name || deck.startsWith(name + SEPARATOR)
}
