import { describe, expect, it } from 'vitest'

import { WORLD } from '../maps/world'
import { applyAction } from './game'
import type { GameAction } from './game'
import { playerFor } from './players'
import { seededRandom } from './random'
import { replayTo } from './replay'
import {
  SavedGameError,
  endingOf,
  readSavedGame,
  toSavedGame,
} from './saved-game'
import { DEFAULT_OPTIONS, createGame } from './setup'
import type { GameState } from './types'

/**
 * The guard for saved games. Plan task 4.58.
 *
 * A saved game is only worth having if it plays back as the SAME game. So
 * this plays a real game with Nick's own rules, writes it to text the way
 * the app does, reads it back, replays it, and checks it lands where the
 * real game did.
 */

const NICKS_RULES = {
  ...DEFAULT_OPTIONS,
  cardSetValue: 'fixed',
  cardTrading: 'afterKnockout',
  fortifyDistance: 'adjacent',
  fortifyMoves: 'many',
} as const

/** Play a game the way the app does: one seed deals, another rolls. */
function aRealGame(seed: number, upTo = Number.POSITIVE_INFINITY) {
  const diceSeed = seed * 7919 + 13
  const random = seededRandom(diceSeed)
  const chooser = seededRandom(seed * 104729 + 5)

  const first = createGame({
    map: WORLD,
    players: ['planner', 'optimus', 'general', 'turtle'].map((kind, at) => ({
      name: `p${at}`,
      kind: kind as 'optimus',
    })),
    random: seededRandom(seed),
    options: NICKS_RULES,
  })

  const actions: GameAction[] = []
  let state: GameState = first

  for (let step = 0; step < 40000 && state.winnerId === null && step < upTo; step += 1) {
    const kind = state.players.find((each) => each.id === state.turn.playerId)?.kind
    const action = playerFor(kind as 'optimus').chooseAction(state, chooser)

    actions.push(action)
    state = applyAction(state, action, random)
  }

  return { recording: { first, actions }, diceSeed, state }
}

describe('a saved game plays back as the same game', () => {
  it('lands exactly where the real game did, through text and back', () => {
    const game = aRealGame(5)
    const text = JSON.stringify(
      toSavedGame(game.recording, game.diceSeed, game.state, '2026-09-21T10:00:00', {
        commit: 'abc1234',
        time: '2026-09-21T09:00:00Z',
      }),
    )

    const read = readSavedGame(text)
    const replayed = replayTo(read, seededRandom(read.diceSeed), read.actions.length)

    expect(game.state.winnerId).not.toBeNull()
    expect(replayed).toEqual(game.state)
    expect(endingOf(replayed)).toEqual(read.ending)
  }, 30_000)

  it('saves a game part way through, and plays back to that point', () => {
    const game = aRealGame(8, 300)
    const read = readSavedGame(
      JSON.stringify(toSavedGame(game.recording, game.diceSeed, game.state, 'now', null)),
    )

    expect(game.state.winnerId).toBeNull()
    expect(replayTo(read, seededRandom(read.diceSeed), read.actions.length)).toEqual(game.state)
    expect(read.build).toBeNull()
  })

  it('keeps who played, in what order, and with which rules', () => {
    const game = aRealGame(3, 50)
    const read = readSavedGame(
      JSON.stringify(toSavedGame(game.recording, game.diceSeed, game.state, 'now', null)),
    )

    expect(read.first.players.map((each) => each.kind)).toEqual([
      'planner',
      'optimus',
      'general',
      'turtle',
    ])
    expect(read.first.options).toEqual(NICKS_RULES)
  })
})

describe('a file that is not a saved game is refused plainly', () => {
  it('refuses text that is not a game file at all', () => {
    expect(() => readSavedGame('hello')).toThrow(SavedGameError)
    expect(() => readSavedGame('hello')).toThrow(/not readable/)
  })

  it('refuses some other kind of file', () => {
    expect(() => readSavedGame('{"format":"a-map"}')).toThrow(/not a saved Conquest game/)
  })

  it('refuses a format it does not know, and says which', () => {
    expect(() =>
      readSavedGame('{"format":"conquest-game","version":9}'),
    ).toThrow(/format 9/)
  })

  it('refuses a file with a piece missing', () => {
    expect(() =>
      readSavedGame('{"format":"conquest-game","version":1,"diceSeed":1}'),
    ).toThrow(/missing part/)
  })
})
