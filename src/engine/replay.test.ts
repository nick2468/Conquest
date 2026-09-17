import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { WORLD } from '../maps/world'
import { applyAction } from './game'
import type { GameAction } from './game'
import { playerFor } from './players'
import { seededRandom } from './random'
import type { Recording } from './replay'
import { replayTo } from './replay'
import { createGame } from './setup'
import type { GameMap, GameState } from './types'

/**
 * The guard for watching a game again. Plan task 4.55.
 *
 * A replay is a SECOND way of producing the states of a game, and any
 * second way can quietly disagree with the first. That is the whole risk,
 * so it is what these tests check: play a game for real, keeping every
 * board, then replay it and compare board for board, log and all.
 *
 * If this ever fails, the engine has stopped being pure. That is worth
 * knowing for its own sake, whatever the replay is doing.
 */

const DICE_SEED = (seed: number): number => seed * 7919 + 13

/** Play a whole game, keeping the actions and every board it passed through. */
function playAndRecord(
  map: GameMap,
  kinds: readonly string[],
  seed: number,
): { recording: Recording; everyBoard: GameState[] } {
  const dealer = seededRandom(seed)
  const random = seededRandom(DICE_SEED(seed))
  const chooser = seededRandom(seed * 104729 + 5)

  const first = createGame({
    map,
    players: kinds.map((kind, index) => ({ name: `p${index}`, kind: kind as 'optimus' })),
    random: dealer,
  })

  const actions: GameAction[] = []
  const everyBoard: GameState[] = [first]
  let state = first

  for (let step = 0; step < 40000 && state.winnerId === null; step += 1) {
    const kind = state.players.find((each) => each.id === state.turn.playerId)?.kind
    const action = playerFor(kind as 'optimus').chooseAction(state, chooser)

    actions.push(action)
    state = applyAction(state, action, random)
    everyBoard.push(state)
  }

  return { recording: { first, actions }, everyBoard }
}

describe('a replay lands on exactly the game it copies', () => {
  for (const seed of [7, 21, 44]) {
    it(`matches every board, seed ${seed}`, () => {
      const { recording, everyBoard } = playAndRecord(
        AUSTRALIA,
        ['optimus', 'general', 'greedy'],
        seed,
      )

      expect(recording.actions.length).toBeGreaterThan(50)

      // Every board, not just the last: a replay that drifted and then
      // came back would pass a final-state check.
      const random = seededRandom(DICE_SEED(seed))
      let state = recording.first

      for (let at = 0; at < recording.actions.length; at += 1) {
        expect(state).toEqual(everyBoard[at])
        state = applyAction(state, recording.actions[at] as GameAction, random)
      }

      expect(state).toEqual(everyBoard[recording.actions.length])
    })
  }

  it('matches on the world map too, where a game is much longer', () => {
    const { recording, everyBoard } = playAndRecord(
      WORLD,
      ['optimus', 'turtle', 'general', 'planner'],
      3,
    )

    expect(recording.actions.length).toBeGreaterThan(300)
    expect(
      replayTo(recording, seededRandom(DICE_SEED(3)), recording.actions.length),
    ).toEqual(everyBoard[recording.actions.length])
  }, 30_000)
})

describe('replayTo answers any point in the game', () => {
  const { recording, everyBoard } = playAndRecord(
    AUSTRALIA,
    ['optimus', 'general', 'greedy'],
    11,
  )

  it('answers the board after each of many points', () => {
    for (const at of [0, 1, 5, 20, 60, recording.actions.length]) {
      expect(replayTo(recording, seededRandom(DICE_SEED(11)), at)).toEqual(
        everyBoard[at],
      )
    }
  })

  it('gives the same answer when asked twice, so scrubbing is safe', () => {
    const once = replayTo(recording, seededRandom(DICE_SEED(11)), 40)
    const twice = replayTo(recording, seededRandom(DICE_SEED(11)), 40)

    expect(once).toEqual(twice)
  })

  it('holds still at the ends rather than throwing', () => {
    expect(replayTo(recording, seededRandom(DICE_SEED(11)), -5)).toEqual(
      recording.first,
    )
    expect(
      replayTo(recording, seededRandom(DICE_SEED(11)), 99999),
    ).toEqual(everyBoard[recording.actions.length])
  })
})
