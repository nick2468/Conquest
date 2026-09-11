import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { scriptedDice } from './dice'
import type { GameAction } from './game'
import { applyAction, legalActions, tradingAllowedNow } from './game'
import { seededRandom } from './random'
import { DEFAULT_OPTIONS, createGame } from './setup'
import type { Card, GameOptions, GameState } from './types'

/**
 * Knockouts and the card rule. Plan task 4.21.
 *
 * Nick: "do any of the computer also know that annihilating an opponent
 * wins his cards?", "and that if defeating a player and getting his cards
 * that he can then use them on this turn too", and "make it another play
 * time option, default Classic."
 *
 * Three players. Ann (p1) attacks from Western Australia into the Northern
 * Territory, which is all Bob (p2) has left. Cy (p3) holds everything else,
 * so taking the Northern Territory knocks Bob out without ending the game.
 */

function aCard(id: string, symbol: Card['symbol'] = 'infantry'): Card {
  return { id, symbol, territoryId: null }
}

function aSet(prefix: string): Card[] {
  return [aCard(`${prefix}1`), aCard(`${prefix}2`), aCard(`${prefix}3`)]
}

function beforeTheKnockout(
  annHolds: readonly Card[],
  bobHolds: readonly Card[],
  options: Partial<GameOptions> = {},
): GameState {
  const base = createGame({
    map: AUSTRALIA,
    players: [
      { name: 'Ann', kind: 'human' },
      { name: 'Bob', kind: 'human' },
      { name: 'Cy', kind: 'human' },
    ],
    random: seededRandom(1),
  })
  const territories: Record<string, { ownerId: string; armies: number }> = {}

  for (const each of AUSTRALIA.territories) {
    territories[each.id] = { ownerId: 'p3', armies: 1 }
  }
  territories['wa'] = { ownerId: 'p1', armies: 6 }
  territories['nt'] = { ownerId: 'p2', armies: 1 }

  return {
    ...base,
    options: { ...base.options, ...options },
    territories,
    players: base.players.map((player) =>
      player.id === 'p1'
        ? { ...player, cards: [...annHolds] }
        : player.id === 'p2'
          ? { ...player, cards: [...bobHolds] }
          : player,
    ),
    turn: {
      ...base.turn,
      playerId: 'p1',
      phase: 'attack',
      armiesToPlace: 0,
      hasConquered: false,
      pendingOccupation: null,
    },
  }
}

/** Take the Northern Territory, and move the smallest garrison in. */
function knockBobOut(state: GameState): GameState {
  const captured = applyAction(
    state,
    { type: 'attack', fromId: 'wa', toId: 'nt' },
    scriptedDice([6, 5, 4, 1]),
  )

  return captured.turn.phase === 'occupy'
    ? applyAction(captured, { type: 'occupy', count: 3 }, seededRandom(2))
    : captured
}

function cardsOf(state: GameState, playerId: string): number {
  return state.players.find((each) => each.id === playerId)?.cards.length ?? -1
}

function trades(state: GameState): GameAction[] {
  return legalActions(state).filter((each) => each.type === 'tradeCards')
}

describe('knocking a player out', () => {
  it('hands all their cards to whoever knocked them out', () => {
    const after = knockBobOut(beforeTheKnockout([], [aCard('b1'), aCard('b2', 'cavalry')]))

    expect(after.players.find((each) => each.id === 'p2')?.isEliminated).toBe(true)
    expect(cardsOf(after, 'p1')).toBe(2)
    expect(cardsOf(after, 'p2')).toBe(0)
    expect(after.log.some((entry) => entry.text === "Ann takes Bob's 2 cards.")).toBe(true)
  })

  it('is Classic by default', () => {
    expect(DEFAULT_OPTIONS.cardTrading).toBe('classic')
  })
})

describe('the classic card rule', () => {
  it('makes six or more cards be traded at once, then carries on attacking', () => {
    let state = knockBobOut(beforeTheKnockout(aSet('a'), aSet('b')))

    // Six cards: back into placing, where only trades are allowed.
    expect(state.turn.phase).toBe('reinforce')
    expect(legalActions(state).every((each) => each.type === 'tradeCards')).toBe(true)

    state = applyAction(state, trades(state)[0] as GameAction, seededRandom(3))
    expect(cardsOf(state, 'p1')).toBe(3)
    expect(state.turn.armiesToPlace).toBeGreaterThan(0)

    state = applyAction(
      state,
      { type: 'placeArmies', territoryId: 'wa', count: state.turn.armiesToPlace },
      seededRandom(4),
    )

    expect(state.turn.phase).toBe('attack')
    expect(state.turn.hasConquered).toBe(true)
  })

  it('keeps five or fewer cards for the next turn', () => {
    const after = knockBobOut(beforeTheKnockout([aCard('a1'), aCard('a2')], aSet('b')))

    expect(after.turn.phase).toBe('attack')
    expect(cardsOf(after, 'p1')).toBe(5)
    expect(trades(after)).toEqual([])
  })

  it('refuses a trade in the middle of an attack', () => {
    const state = beforeTheKnockout(aSet('a'), [aCard('b1')])

    expect(tradingAllowedNow(state)).toBe(false)
    expect(trades(state)).toEqual([])
    expect(() =>
      applyAction(state, { type: 'tradeCards', cardIds: ['a1', 'a2', 'a3'] }, seededRandom(5)),
    ).toThrow()
  })
})

describe('trading after a knockout', () => {
  it('offers no trade before the knockout, and any set after it', () => {
    const state = beforeTheKnockout(aSet('a'), [aCard('b1', 'cavalry')], {
      cardTrading: 'afterKnockout',
    })

    expect(trades(state)).toEqual([])

    const after = knockBobOut(state)

    expect(after.turn.phase).toBe('attack')
    expect(trades(after).length).toBeGreaterThan(0)

    const traded = applyAction(after, trades(after)[0] as GameAction, seededRandom(6))

    expect(traded.turn.phase).toBe('reinforce')
    expect(traded.turn.armiesToPlace).toBeGreaterThan(0)
  })
})

describe('trading any time during an attack', () => {
  it('offers a set in the middle of an attack, with no knockout needed', () => {
    const state = beforeTheKnockout(aSet('a'), [aCard('b1')], { cardTrading: 'anyTime' })

    expect(trades(state).length).toBeGreaterThan(0)

    const traded = applyAction(state, trades(state)[0] as GameAction, seededRandom(7))

    expect(traded.turn.phase).toBe('reinforce')

    const placed = applyAction(
      traded,
      { type: 'placeArmies', territoryId: 'wa', count: traded.turn.armiesToPlace },
      seededRandom(8),
    )

    expect(placed.turn.phase).toBe('attack')
  })
})
