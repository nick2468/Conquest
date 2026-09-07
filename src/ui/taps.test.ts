import { describe, expect, it } from 'vitest'

import type { Board, GameState } from '../engine'
import { applyAction, createGame, legalActions, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { highlightsFor, whatATapDoes, whatToDoNow } from './taps'

/** A board where 'p1' owns what is named, and 'p2' owns the rest. */
function boardWhere(mine: Readonly<Record<string, number>>): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const each of AUSTRALIA.territories) {
    const armies = mine[each.id]

    board[each.id] =
      armies === undefined
        ? { ownerId: 'p2', armies: 1 }
        : { ownerId: 'p1', armies }
  }

  return board
}

function gameWith(
  board: Board,
  turn: Partial<GameState['turn']> = {},
): GameState {
  const base = createGame({
    map: AUSTRALIA,
    players: [
      { name: 'Ann', kind: 'human' },
      { name: 'Bob', kind: 'human' },
    ],
    random: seededRandom(1),
  })

  return {
    ...base,
    territories: board,
    turn: {
      playerId: 'p1',
      phase: 'attack',
      armiesToPlace: 0,
      hasConquered: false,
      hasFortified: false,
      pendingOccupation: null,
      lastAttack: null,
      ...turn,
    },
  }
}

describe('lighting up the map', () => {
  it('offers every territory you own while reinforcing', () => {
    const state = gameWith(boardWhere({ wa: 1, nt: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    expect([...highlightsFor(state, null).canStart].sort()).toEqual([
      'nt',
      'wa',
    ])
  })

  it('offers nowhere to finish until a territory is chosen', () => {
    const state = gameWith(boardWhere({ wa: 5 }))

    expect(highlightsFor(state, null).canFinish.size).toBe(0)
  })

  it('offers the targets of the chosen territory once it is chosen', () => {
    const state = gameWith(boardWhere({ wa: 5 }))

    // Western Australia borders the Northern Territory, South Australia and
    // Rottnest Island. Bob holds all three.
    expect([...highlightsFor(state, 'wa').canFinish].sort()).toEqual([
      'nt',
      'rot',
      'sa',
    ])
  })

  it('offers no targets for a territory that cannot attack', () => {
    const state = gameWith(boardWhere({ wa: 1 }))

    expect(highlightsFor(state, 'wa').canFinish.size).toBe(0)
  })
})

describe('a tap while reinforcing', () => {
  const state = gameWith(boardWhere({ wa: 1 }), {
    phase: 'reinforce',
    armiesToPlace: 3,
  })

  it('places one army on a territory you own', () => {
    expect(whatATapDoes(state, null, 'wa')).toEqual({
      kind: 'act',
      action: { type: 'placeArmies', territoryId: 'wa', count: 1 },
    })
  })

  it('does nothing on a territory somebody else owns', () => {
    expect(whatATapDoes(state, null, 'nt')).toEqual({ kind: 'ignore' })
  })
})

describe('a tap while attacking', () => {
  const state = gameWith(boardWhere({ wa: 5, nt: 3 }))

  it('chooses the territory to attack from', () => {
    expect(whatATapDoes(state, null, 'wa')).toEqual({
      kind: 'select',
      territoryId: 'wa',
    })
  })

  it('attacks when a bordering enemy is tapped second', () => {
    expect(whatATapDoes(state, 'wa', 'sa')).toEqual({
      kind: 'act',
      action: { type: 'attack', fromId: 'wa', toId: 'sa' },
    })
  })

  it('lets the chosen territory go when it is tapped again', () => {
    expect(whatATapDoes(state, 'wa', 'wa')).toEqual({ kind: 'clear' })
  })

  it('moves the choice when another of your territories is tapped', () => {
    expect(whatATapDoes(state, 'wa', 'nt')).toEqual({
      kind: 'select',
      territoryId: 'nt',
    })
  })

  it('lets the choice go when somewhere useless is tapped', () => {
    // Tasmania is nowhere near Western Australia.
    expect(whatATapDoes(state, 'wa', 'tas')).toEqual({ kind: 'clear' })
  })

  it('ignores a useless tap when nothing is chosen', () => {
    expect(whatATapDoes(state, null, 'tas')).toEqual({ kind: 'ignore' })
  })
})

describe('a tap while fortifying', () => {
  const state = gameWith(boardWhere({ wa: 5, nt: 2 }), { phase: 'fortify' })

  it('chooses where the armies come from', () => {
    expect(whatATapDoes(state, null, 'wa')).toEqual({
      kind: 'select',
      territoryId: 'wa',
    })
  })

  // Fortifying moves a number of armies, so the screen has to ask. Attacking
  // does not, which is the one difference between the two phases.
  it('asks how many armies when the second territory is tapped', () => {
    expect(whatATapDoes(state, 'wa', 'nt')).toEqual({
      kind: 'askHowMany',
      fromId: 'wa',
      toId: 'nt',
    })
  })

  it('does nothing for a territory the armies cannot reach', () => {
    expect(whatATapDoes(state, 'wa', 'tas')).toEqual({ kind: 'clear' })
  })
})

describe('a tap that should be ignored', () => {
  it('is ignored while the game waits for armies to move in', () => {
    const captured = applyAction(
      gameWith(boardWhere({ wa: 6 })),
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      seededRandom(3),
    )

    if (captured.turn.phase === 'occupy') {
      expect(whatATapDoes(captured, null, 'wa')).toEqual({ kind: 'ignore' })
    }
  })

  it('is ignored once the game is over', () => {
    const board: Record<string, { ownerId: string; armies: number }> = {}

    for (const each of AUSTRALIA.territories) {
      board[each.id] = { ownerId: 'p1', armies: 1 }
    }

    const over: GameState = {
      ...gameWith(board, { phase: 'gameOver' }),
      winnerId: 'p1',
    }

    expect(whatATapDoes(over, null, 'wa')).toEqual({ kind: 'ignore' })
  })
})

// The screen must never offer a move the engine would then refuse. This
// checks the whole loop: what a tap produces really is a legal action.
describe('every tap the screen acts on is legal', () => {
  it('produces only actions the engine allows', () => {
    const boards: Array<[Board, Partial<GameState['turn']>]> = [
      [boardWhere({ wa: 1, nt: 1 }), { phase: 'reinforce', armiesToPlace: 3 }],
      [boardWhere({ wa: 5, nt: 3 }), { phase: 'attack' }],
      [boardWhere({ wa: 5, nt: 2 }), { phase: 'fortify' }],
    ]

    for (const [board, turn] of boards) {
      const state = gameWith(board, turn)
      const chosen = [null, 'wa', 'nt', 'tas']

      for (const selectedId of chosen) {
        for (const each of AUSTRALIA.territories) {
          const result = whatATapDoes(state, selectedId, each.id)

          if (result.kind !== 'act') {
            continue
          }

          expect(() =>
            applyAction(state, result.action, seededRandom(1)),
          ).not.toThrow()
        }
      }
    }
  })

  it('offers to light up only territories that lead somewhere', () => {
    const state = gameWith(boardWhere({ wa: 5, nt: 3 }))
    const fromIds = new Set(
      legalActions(state)
        .filter((action) => action.type === 'attack')
        .map((action) => (action.type === 'attack' ? action.fromId : '')),
    )

    expect([...highlightsFor(state, null).canStart].sort()).toEqual(
      [...fromIds].sort(),
    )
  })
})

describe('the sentence telling the player what to do', () => {
  it('names the player and the job while reinforcing', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 4,
    })

    expect(whatToDoNow(state, null)).toContain('Ann')
    expect(whatToDoNow(state, null)).toContain('4 armies')
  })

  // With five cards the engine refuses everything but a trade. Asking for
  // taps it is about to refuse would send the player round in circles.
  it('says to trade first when the player holds five cards', () => {
    const base = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 4,
    })

    const state: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'p1'
          ? {
              ...player,
              cards: ['a', 'b', 'c', 'd', 'e'].map((id) => ({
                id,
                symbol: 'infantry' as const,
                territoryId: 'wa',
              })),
            }
          : player,
      ),
    }

    expect(whatToDoNow(state, null)).toContain('5 cards')
    expect(whatToDoNow(state, null)).toContain('Trade a set')
    expect(whatToDoNow(state, null)).not.toContain('tap your territories')
  })

  it('changes once a territory is chosen', () => {
    const state = gameWith(boardWhere({ wa: 5 }))

    expect(whatToDoNow(state, null)).not.toBe(whatToDoNow(state, 'wa'))
  })

  it('names the winner when the game is over', () => {
    const board: Record<string, { ownerId: string; armies: number }> = {}

    for (const each of AUSTRALIA.territories) {
      board[each.id] = { ownerId: 'p1', armies: 1 }
    }

    const over: GameState = {
      ...gameWith(board, { phase: 'gameOver' }),
      winnerId: 'p1',
    }

    expect(whatToDoNow(over, null)).toContain('Ann')
    expect(whatToDoNow(over, null)).toContain('won')
  })
})
