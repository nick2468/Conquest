import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { TERRITORY_CARD_BONUS } from './balance'
import { territoryForBonus } from './cards'
import { applyAction } from './game'
import { fixedRandom, seededRandom } from './random'
import { DEFAULT_OPTIONS, createGame } from './setup'
import type { Board, Card, GameState, TerritoryId } from './types'

/**
 * The territory card bonus. Plan task 4.57, spec 6.6.
 *
 * Nick asked for each card to show "the country it is a benefit for". The
 * printed rules give that benefit: trade a set that includes a card showing
 * a territory you hold, and two extra armies go onto that territory, once a
 * turn at most. The game did not have the rule; spec 14 had put it off
 * "until trading works". These tests are the rule.
 */

const NO_DICE = fixedRandom(0)

/** Everything named is p1's with that many armies; the rest is p2's, one each. */
function boardWhere(mine: Readonly<Record<string, number>>, theirs: Readonly<Record<string, number>> = {}): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const each of AUSTRALIA.territories) {
    const armies = mine[each.id]

    board[each.id] =
      armies === undefined
        ? { ownerId: 'p2', armies: theirs[each.id] ?? 1 }
        : { ownerId: 'p1', armies }
  }

  return board
}

function card(id: string, symbol: Card['symbol'], territoryId: TerritoryId | null): Card {
  return { id, symbol, territoryId }
}

/** p1 about to place armies, holding these cards. */
function holding(
  cards: readonly Card[],
  board: Board,
  options: Partial<GameState['options']> = {},
): GameState {
  const base = createGame({
    map: AUSTRALIA,
    players: [
      { name: 'Ann', kind: 'human' },
      { name: 'Bob', kind: 'human' },
    ],
    random: seededRandom(1),
    options: { ...DEFAULT_OPTIONS, ...options },
  })

  return {
    ...base,
    territories: board,
    players: base.players.map((player) =>
      player.id === 'p1' ? { ...player, cards } : player,
    ),
    turn: {
      playerId: 'p1',
      phase: 'reinforce',
      armiesToPlace: 3,
      armiesGiven: 3,
      hasConquered: false,
      hasFortified: false,
      pendingOccupation: null,
      lastAttack: null,
    },
  }
}

function trade(state: GameState, ids: readonly string[]): GameState {
  return applyAction(state, { type: 'tradeCards', cardIds: ids }, NO_DICE)
}

const armies = (state: GameState, id: TerritoryId): number =>
  state.territories[id]?.armies ?? 0

describe('a card showing a territory you hold', () => {
  it('puts two armies straight onto that territory', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    const after = trade(state, ['a', 'b', 'c'])

    expect(armies(after, 'wa')).toBe(4 + TERRITORY_CARD_BONUS)
  })

  it('does not add them to the armies still to place', () => {
    // They are already on the board. Counting them twice would be a gift.
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    const after = trade(state, ['a', 'b', 'c'])

    // The first set of a rising game is worth 4.
    expect(after.turn.armiesToPlace).toBe(3 + 4)
  })

  it('says so in the history', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    const said = trade(state, ['a', 'b', 'c']).log.map((each) => each.text)

    expect(said.at(-1)).toMatch(/Western Australia.*2 more armies go straight there/)
  })

  it('leaves every other territory as it was', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4, nt: 2 }),
    )

    const after = trade(state, ['a', 'b', 'c'])

    for (const each of AUSTRALIA.territories) {
      if (each.id === 'wa') continue
      expect(after.territories[each.id]).toEqual(state.territories[each.id])
    }
  })
})

describe('when there is no bonus', () => {
  it('gives nothing for territories somebody else holds', () => {
    const state = holding(
      [card('a', 'infantry', 'qld'), card('b', 'cavalry', 'nsw'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    const after = trade(state, ['a', 'b', 'c'])

    expect(after.territories).toEqual(state.territories)
    expect(after.turn.territoryBonusTaken).toBe(false)
  })

  it('gives nothing for a wild card, which shows no territory', () => {
    const state = holding(
      [card('a', 'wild', null), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    expect(trade(state, ['a', 'b', 'c']).territories).toEqual(state.territories)
  })

  it('gives nothing when the game has the rule turned off', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
      { territoryCardBonus: false },
    )

    expect(armies(trade(state, ['a', 'b', 'c']), 'wa')).toBe(4)
  })

  it('gives nothing in a game from before the rule existed', () => {
    // A game whose options never mention the rule is played the old way.
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )
    const old: GameState = {
      ...state,
      options: { ...state.options, territoryCardBonus: undefined },
    }

    expect(armies(trade(old, ['a', 'b', 'c']), 'wa')).toBe(4)
  })
})

describe('only one bonus a turn', () => {
  it('pays once even when two cards in the set qualify', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'tas'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4, tas: 4 }),
    )

    const after = trade(state, ['a', 'b', 'c'])
    const added =
      armies(after, 'wa') - 4 + (armies(after, 'tas') - 4)

    expect(added).toBe(TERRITORY_CARD_BONUS)
  })

  it('puts it where the enemy is thickest', () => {
    // Western Australia faces the Northern Territory and South Australia.
    // Tasmania faces only Victoria. Pile the enemy up beside the West.
    const board = boardWhere({ wa: 4, tas: 4 }, { nt: 9, sa: 9, vic: 1 })
    const state = holding(
      [card('a', 'infantry', 'tas'), card('b', 'cavalry', 'wa'), card('c', 'artillery', 'qld')],
      board,
    )

    expect(territoryForBonus(state, 'p1', state.players[0]!.cards)).toBe('wa')
    expect(armies(trade(state, ['a', 'b', 'c']), 'wa')).toBe(4 + TERRITORY_CARD_BONUS)
  })

  it('pays nothing on a second set traded the same turn', () => {
    const first = [card('a', 'infantry', 'wa'), card('b', 'infantry', 'qld'), card('c', 'infantry', 'vic')]
    const second = [card('d', 'cavalry', 'wa'), card('e', 'cavalry', 'nsw'), card('f', 'cavalry', 'sa')]
    const state = holding([...first, ...second], boardWhere({ wa: 4 }))

    const once = trade(state, ['a', 'b', 'c'])
    const twice = trade(once, ['d', 'e', 'f'])

    expect(armies(once, 'wa')).toBe(4 + TERRITORY_CARD_BONUS)
    expect(armies(twice, 'wa')).toBe(4 + TERRITORY_CARD_BONUS)
    expect(twice.turn.territoryBonusTaken).toBe(true)
  })

  it('is available again on the next turn', () => {
    const state = holding(
      [card('a', 'infantry', 'wa'), card('b', 'cavalry', 'qld'), card('c', 'artillery', 'vic')],
      boardWhere({ wa: 4 }),
    )

    let after = trade(state, ['a', 'b', 'c'])

    // Place everything, then pass the turn round to p2 and back.
    after = applyAction(after, { type: 'placeArmies', territoryId: 'wa', count: after.turn.armiesToPlace }, NO_DICE)
    after = applyAction(after, { type: 'endAttackPhase' }, NO_DICE)
    after = applyAction(after, { type: 'skipFortify' }, NO_DICE)

    expect(after.turn.playerId).toBe('p2')
    expect(after.turn.territoryBonusTaken).not.toBe(true)
  })
})

describe('it is on by default', () => {
  it('because it is in the printed rules', () => {
    expect(DEFAULT_OPTIONS.territoryCardBonus).toBe(true)
  })
})
