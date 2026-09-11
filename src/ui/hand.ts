import type { Card, CardId, CardTrio, GameState } from '../engine'
import { tradingAllowedNow, isSet, mustTradeASet, setValue, setsInHand } from '../engine'

/**
 * The rules about a player's hand of cards, as the screen needs them.
 *
 * No React here, so all of it is tested without a browser. Every answer
 * comes from the engine. The screen never works out for itself what a set
 * is or what one is worth.
 */

export interface HandAdvice {
  /** True if these three cards can be traded now. */
  readonly canTrade: boolean
  /** What they would be worth. Zero when they cannot be traded. */
  readonly value: number
  /** What to tell the player. */
  readonly message: string
  /** True when the player cannot do anything else until they trade. */
  readonly forced: boolean
}

function chosenCards(
  cards: readonly Card[],
  chosenIds: readonly CardId[],
): Card[] {
  return chosenIds
    .map((id) => cards.find((card) => card.id === id))
    .filter((card): card is Card => card !== undefined)
}

/** Exactly three cards, or nothing. */
export function asTrio(cards: readonly Card[]): CardTrio | null {
  return cards.length === 3
    ? [cards[0] as Card, cards[1] as Card, cards[2] as Card]
    : null
}

/** Why a set cannot be traded just now, for each card rule. */
const WHEN_TO_TRADE = {
  classic:
    'Cards can only be traded at the start of your turn, or at once after a knockout leaves you six or more.',
  afterKnockout:
    'Cards can be traded at the start of your turn, and after you knock a player out.',
  anyTime: 'Cards can be traded at the start of your turn, and during your attack.',
} as const

/**
 * What to say about the cards the player has picked out.
 *
 * Trading is only ever allowed while reinforcing, so the advice says so
 * rather than leaving the player to guess why the button does nothing.
 */
export function adviseOnHand(
  state: GameState,
  cards: readonly Card[],
  chosenIds: readonly CardId[],
): HandAdvice {
  const forced = mustTradeASet(cards)

  if (!tradingAllowedNow(state)) {
    return {
      canTrade: false,
      value: 0,
      forced,
      message: WHEN_TO_TRADE[state.options.cardTrading ?? 'classic'],
    }
  }

  const trio = asTrio(chosenCards(cards, chosenIds))

  if (trio === null) {
    return {
      canTrade: false,
      value: 0,
      forced,
      message: forced
        ? `You hold ${cards.length} cards, so you must trade a set before ` +
          `anything else. The green button will do it.`
        : 'Pick three cards to trade them for armies.',
    }
  }

  if (!isSet(trio)) {
    return {
      canTrade: false,
      value: 0,
      forced,
      message:
        'Those three are not a set. A set is three of the same, or three ' +
        'all different. A wild card counts as anything.',
    }
  }

  const value = setValue(trio, state.options, state.deck.setsTraded)

  return {
    canTrade: true,
    value,
    forced,
    message: `Trade these three for ${value} armies.`,
  }
}

/**
 * The set in this hand worth the most right now.
 *
 * Used by the "choose a set for me" button, which matters most when a
 * player is forced to trade and cannot see a set among five cards.
 *
 * With a rising value every set is worth the same, so it returns the first
 * one. With a fixed value it returns the dearest.
 */
export function bestSetIn(
  state: GameState,
  cards: readonly Card[],
): CardTrio | null {
  const sets = setsInHand(cards)

  if (sets.length === 0) {
    return null
  }

  let best = sets[0] as CardTrio
  let bestValue = setValue(best, state.options, state.deck.setsTraded)

  for (const trio of sets.slice(1)) {
    const value = setValue(trio, state.options, state.deck.setsTraded)

    if (value > bestValue) {
      best = trio
      bestValue = value
    }
  }

  return best
}

/** A set the player is holding and could trade this moment. */
export interface SetWaiting {
  readonly cards: CardTrio
  /** What it would be worth, right now. */
  readonly value: number
}

/**
 * Is there a set the player could trade this very moment?
 *
 * Nick asked for this after losing games: "sometimes we've lost a game and
 * realised that we should have traded a set." Nothing on screen ever said
 * so. The cards were all there to see, and seeing three of a kind among
 * five cards while you are thinking about an attack is a job nobody should
 * have to do.
 *
 * Null when there is no set, and null outside the reinforce phase, because
 * a set that cannot be traded now is not worth shouting about.
 */
export function setReadyToTrade(state: GameState): SetWaiting | null {
  if (!tradingAllowedNow(state)) {
    return null
  }

  const player = state.players.find((each) => each.id === state.turn.playerId)
  const best = bestSetIn(state, player?.cards ?? [])

  if (best === null) {
    return null
  }

  return {
    cards: best,
    value: setValue(best, state.options, state.deck.setsTraded),
  }
}

/** What a card shows, in words a player can read. */
export function describeCard(
  state: GameState,
  card: Card,
): { readonly symbol: string; readonly place: string } {
  const place =
    card.territoryId === null
      ? 'Any territory'
      : (state.map.territories.find((each) => each.id === card.territoryId)
          ?.name ?? card.territoryId)

  const symbol =
    card.symbol === 'wild'
      ? 'Wild'
      : card.symbol.charAt(0).toUpperCase() + card.symbol.slice(1)

  return { symbol, place }
}
