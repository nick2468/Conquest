/**
 * The card deck. See spec 6.6.
 *
 * This file holds deck building for now. What makes a set, and what a set is
 * worth, arrive with plan task 1.4.3 and live here too.
 */
import { WILD_CARDS } from './balance'
import type { RandomSource } from './random'
import { shuffle } from './random'
import type { Card, CardSymbol, DeckState, GameMap } from './types'

/** The three symbols on the ordinary cards, in the order they are dealt out. */
const SYMBOLS: readonly CardSymbol[] = ['infantry', 'cavalry', 'artillery']

/**
 * Build a shuffled deck for a map.
 *
 * One card for each territory, with the three symbols spread evenly, plus the
 * wild cards. So a bigger map gets a bigger deck with no extra thought.
 */
export function createDeck(map: GameMap, random: RandomSource): DeckState {
  const territoryCards: Card[] = map.territories.map((territory, position) => ({
    id: `card-${territory.id}`,
    symbol: SYMBOLS[position % SYMBOLS.length] as CardSymbol,
    territoryId: territory.id,
  }))

  const wildCards: Card[] = []

  for (let made = 0; made < WILD_CARDS; made += 1) {
    wildCards.push({
      id: `card-wild-${made + 1}`,
      symbol: 'wild',
      territoryId: null,
    })
  }

  return {
    undrawn: shuffle(random, [...territoryCards, ...wildCards]),
    discarded: [],
    setsTraded: 0,
  }
}
