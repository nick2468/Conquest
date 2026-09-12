import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { applyAction } from './game'
import { playerFor } from './players'
import { seededRandom } from './random'
import { createGame } from './setup'
import { standings, strengthOf } from './strength'
import type { GameState } from './types'

/**
 * The guard for the leaderboard. Plan task 4.51.
 *
 * The weights were measured, so the thing worth testing here is not the
 * numbers but the READING: that a better position reads as better, that the
 * chances add up, and that a player who is out is last.
 *
 * The last test is the one that matters. It plays whole games and checks
 * that the player leading the table at the end is usually the player who
 * wins, because a leaderboard that does not track the winner is a
 * decoration.
 */

function afterSomeMoves(seed: number, moves: number): GameState {
  const random = seededRandom(seed)
  const choices = seededRandom(seed * 31 + 7)

  let state = createGame({
    map: AUSTRALIA,
    players: [
      { name: 'One', kind: 'optimus' },
      { name: 'Two', kind: 'general' },
      { name: 'Three', kind: 'greedy' },
    ],
    random,
  })

  for (let step = 0; step < moves && state.winnerId === null; step += 1) {
    const kind = state.players.find(
      (each) => each.id === state.turn.playerId,
    )?.kind

    state = applyAction(
      state,
      playerFor(kind as 'optimus').chooseAction(state, choices),
      random,
    )
  }

  return state
}

describe('the leaderboard reads sensibly', () => {
  it('gives every live player a place, strongest first', () => {
    // Several points in several games, rather than one moment that might
    // happen to have everybody still in.
    for (const seed of [11, 12, 13]) {
      for (const moves of [40, 120, 400, 2000]) {
        const state = afterSomeMoves(seed, moves)
        const table = standings(state)
        const live = state.players.filter((each) => !each.isEliminated).length

        expect(table).toHaveLength(state.players.length)

        // The live players hold the places, strongest first.
        expect(table.slice(0, live).map((each) => each.place)).toEqual(
          Array.from({ length: live }, (_, at) => at + 1),
        )

        for (let at = 1; at < live; at += 1) {
          expect(table[at]?.chance).toBeLessThanOrEqual(
            table[at - 1]?.chance ?? 1,
          )
        }

        // Everybody who is out comes after all of them.
        for (const each of table.slice(live)) {
          expect(each.chance).toBe(0)
          expect(each.place).toBeGreaterThan(live)
        }
      }
    }
  })

  it('shares out one whole game between the live players', () => {
    for (const seed of [11, 12, 13, 14]) {
      const table = standings(afterSomeMoves(seed, 150))
      const total = table.reduce((sum, each) => sum + each.chance, 0)

      expect(total).toBeCloseTo(1, 8)
    }
  })

  it('puts a player who is out last, on no chance at all', () => {
    // Played long enough that somebody has usually gone out.
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const state = afterSomeMoves(seed, 4000)
      const table = standings(state)
      const out = table.filter((each) => each.chance === 0)

      for (const each of out) {
        expect(
          state.players.find((player) => player.id === each.playerId)
            ?.isEliminated,
        ).toBe(true)
        expect(each.place).toBeGreaterThanOrEqual(
          table.filter((one) => one.chance > 0).length + 1,
        )
      }
    }
  })

  it('ranks more land and more armies above less', () => {
    const state = afterSomeMoves(31, 120)
    const me = state.players.find((each) => !each.isEliminated)?.id as string
    expect(me).toBeDefined()
    const board = { ...state.territories }
    const mine = Object.keys(board).find(
      (id) => board[id]?.ownerId === me,
    ) as string

    const before = strengthOf(state, me)
    const after = strengthOf(
      {
        ...state,
        territories: {
          ...board,
          [mine]: { ownerId: me, armies: (board[mine]?.armies ?? 1) + 20 },
        },
      },
      me,
    )

    expect(after).toBeGreaterThan(before)
  })

  it('says a player who is out is beyond the bottom', () => {
    const state = afterSomeMoves(11, 40)
    const gone: GameState = {
      ...state,
      players: state.players.map((each, at) =>
        at === 0 ? { ...each, isEliminated: true } : each,
      ),
    }

    expect(strengthOf(gone, state.players[0]?.id as string)).toBe(-Infinity)
  })
})

describe('the leaderboard tracks who actually wins', () => {
  it('has the winner on top at the end far more often than not', () => {
    let onTop = 0
    let played = 0

    for (let seed = 100; seed < 160; seed += 1) {
      const random = seededRandom(seed)
      const choices = seededRandom(seed * 31 + 7)

      let state = createGame({
        map: AUSTRALIA,
        players: [
          { name: 'One', kind: 'optimus' },
          { name: 'Two', kind: 'general' },
          { name: 'Three', kind: 'greedy' },
        ],
        random,
      })

      let before = state

      for (let step = 0; step < 40000 && state.winnerId === null; step += 1) {
        before = state

        const kind = state.players.find(
          (each) => each.id === state.turn.playerId,
        )?.kind

        state = applyAction(
          state,
          playerFor(kind as 'optimus').chooseAction(state, choices),
          random,
        )
      }

      if (state.winnerId === null) continue

      played += 1

      // The table one move BEFORE the end, so it is a reading and not a
      // statement of the result.
      if (standings(before)[0]?.playerId === state.winnerId) {
        onTop += 1
      }
    }

    expect(played).toBeGreaterThan(50)
    // Measured at 100% on these seeds. The bar is set well below that: the
    // point is that the table tracks the game, not that it is never wrong.
    expect(onTop / played).toBeGreaterThan(0.8)
  })
})
