/**
 * The cards. See spec 6.6.
 *
 * A player who takes at least one territory during a turn draws one card at
 * the end of it. One card per turn at most, however many territories they
 * took. Three cards make a set, and a set trades for armies.
 */
import {
  CARDS_FORCING_A_TRADE,
  FIXED_SET_VALUE,
  RISING_SET_CAP,
  RISING_SET_INCREMENT,
  RISING_SET_VALUES,
  WILD_CARDS,
} from './balance'
import type { RandomSource } from './random'
import { shuffle } from './random'
import type {
  Card,
  CardSymbol,
  DeckState,
  GameMap,
  GameOptions,
  GameState,
  PlayerId,
  TerritoryId,
} from './types'

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

/** Exactly three cards. A set is always three. */
export type CardTrio = readonly [Card, Card, Card]

function countBySymbol(cards: CardTrio): Map<CardSymbol, number> {
  const counts = new Map<CardSymbol, number>()

  for (const card of cards) {
    counts.set(card.symbol, (counts.get(card.symbol) ?? 0) + 1)
  }

  return counts
}

/**
 * Is this three cards a set?
 *
 * A set is three cards with the same symbol, or three cards with three
 * different symbols. A wild card counts as any symbol.
 *
 * That last rule has a consequence worth knowing: ANY three cards holding at
 * least one wild are a set. Two cards the same plus a wild make three of a
 * kind. Two cards different plus a wild make three different. There is no
 * third case.
 */
export function isSet(cards: CardTrio): boolean {
  const counts = countBySymbol(cards)
  const wilds = counts.get('wild') ?? 0

  if (wilds > 0) {
    return true
  }

  const symbols = [...counts.keys()]

  const allTheSame = symbols.length === 1
  const allDifferent = symbols.length === 3

  return allTheSame || allDifferent
}

/**
 * What a set is worth when the value is fixed.
 *
 * Wild cards make a set worth whatever the best reading of it is. Two
 * artillery and a wild are three artillery. One artillery and two wilds could
 * also be three different symbols, which is worth more, so that is what they
 * are.
 */
function fixedValueOf(cards: CardTrio): number {
  const counts = countBySymbol(cards)
  const wilds = counts.get('wild') ?? 0
  const realSymbols = [...counts.keys()].filter(
    (symbol): symbol is Exclude<CardSymbol, 'wild'> => symbol !== 'wild',
  )

  const values: number[] = []

  // Three different symbols, if the wilds can fill the gaps.
  if (realSymbols.length + wilds >= 3) {
    values.push(FIXED_SET_VALUE.mixed)
  }

  // Three of a kind, for any symbol the wilds can top up to three.
  for (const symbol of realSymbols) {
    if ((counts.get(symbol) ?? 0) + wilds === 3) {
      values.push(FIXED_SET_VALUE[symbol])
    }
  }

  if (values.length === 0) {
    throw new Error('Those three cards are not a set, so they have no value.')
  }

  return Math.max(...values)
}

/**
 * What a set is worth when the value rises.
 *
 * The count runs across the whole game, not per player. See spec 6.6. That is
 * what makes late turns big and brings the game to an end.
 */
export function risingValueOf(
  setsTradedBefore: number,
  cap: number = RISING_SET_CAP,
): number {
  const listed = RISING_SET_VALUES[setsTradedBefore]

  if (listed !== undefined) {
    return Math.min(listed, cap)
  }

  const last = RISING_SET_VALUES[RISING_SET_VALUES.length - 1] as number
  const beyond = setsTradedBefore - RISING_SET_VALUES.length + 1

  return Math.min(last + beyond * RISING_SET_INCREMENT, cap)
}

/** What trading this set gives the player, right now. */
export function setValue(
  cards: CardTrio,
  options: GameOptions,
  setsTradedBefore: number,
): number {
  if (!isSet(cards)) {
    throw new Error('Those three cards are not a set, so they have no value.')
  }

  return options.cardSetValue === 'fixed'
    ? fixedValueOf(cards)
    : risingValueOf(setsTradedBefore, options.risingSetCap ?? RISING_SET_CAP)
}

/**
 * Every set a player could trade from the cards in their hand.
 *
 * The screen uses this to offer a choice, and a computer player uses it to
 * pick one. Both read the same list, so they cannot disagree.
 */
export function setsInHand(cards: readonly Card[]): CardTrio[] {
  const found: CardTrio[] = []

  for (let first = 0; first < cards.length; first += 1) {
    for (let second = first + 1; second < cards.length; second += 1) {
      for (let third = second + 1; third < cards.length; third += 1) {
        const trio: CardTrio = [
          cards[first] as Card,
          cards[second] as Card,
          cards[third] as Card,
        ]

        if (isSet(trio)) {
          found.push(trio)
        }
      }
    }
  }

  return found
}

/**
 * Must this player trade before doing anything else?
 *
 * Holding five cards forces a trade. It is what stops a player hoarding
 * cards all game and cashing them at the end.
 */
export function mustTradeASet(cards: readonly Card[]): boolean {
  return cards.length >= CARDS_FORCING_A_TRADE
}

/**
 * Where a traded set puts the territory card bonus, or null for nowhere.
 * Plan task 4.57, spec 6.6.
 *
 * A card showing a territory the player holds earns TERRITORY_CARD_BONUS
 * extra armies on that territory. The printed rules say the armies MUST go
 * there, so there is nothing to decide about where, and they are placed at
 * once rather than handed to the player to place. That is what the spec
 * called "a fiddly special case in the screen", and placing them directly
 * is how it stops being one.
 *
 * When more than one of the three cards qualifies, only one bonus is paid.
 * It goes on the one facing the most enemy armies, because that is where
 * two armies do the most good, and every player gets the same choice made
 * the same way. A tie goes to the card traded first.
 */
export function territoryForBonus(
  state: GameState,
  playerId: PlayerId,
  cards: readonly Card[],
): TerritoryId | null {
  let best: { id: TerritoryId; facing: number } | null = null

  for (const card of cards) {
    const id = card.territoryId

    if (id === null || state.territories[id]?.ownerId !== playerId) continue

    const borders =
      state.map.territories.find((each) => each.id === id)?.borders ?? []
    const facing = borders.reduce((total, border) => {
      const there = state.territories[border]

      return there !== undefined && there.ownerId !== null && there.ownerId !== playerId
        ? total + there.armies
        : total
    }, 0)

    if (best === null || facing > best.facing) {
      best = { id, facing }
    }
  }

  return best?.id ?? null
}
