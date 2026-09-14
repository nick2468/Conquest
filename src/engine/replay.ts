import { applyAction } from './game'
import type { GameAction } from './game'
import type { RandomSource } from './random'
import type { GameState } from './types'

/**
 * Watching a finished game again. Plan task 4.55.
 *
 * Nick: "could we create a post game replay animation, no sounds, that lets
 * the human player see the map change as it was played?"
 *
 * This costs almost nothing, and the reason is spec S2 and S3. The engine
 * is pure and never changes a value in place, and every dice roll comes
 * from a source that is handed in. So a whole game is described by three
 * small things: the board it started on, the list of actions taken, and the
 * seed the dice came from. Replaying is just doing them again.
 *
 * Nothing is stored per move. A game of two thousand actions is a list of
 * two thousand small objects, not two thousand boards. Stepping forward
 * applies one more action; stepping back replays from the start, which
 * takes a few milliseconds because an action is cheap.
 *
 * The danger with a second way of producing states is that it can disagree
 * with the first. `replay.test.ts` plays whole games and checks that a
 * replay lands on exactly the same board, log and all.
 */

/** Everything needed to watch a game again. */
export interface Recording {
  /** The board as it stood before anybody moved. */
  readonly first: GameState
  /** Every action taken, in order. */
  readonly actions: readonly GameAction[]
}

/**
 * The board as it stood after `upTo` actions.
 *
 * `random` must be a FRESH source, seeded exactly as the real game's was.
 * It carries its own position, so a source part-way through a game would
 * roll different dice and answer a different board.
 */
export function replayTo(
  recording: Recording,
  random: RandomSource,
  upTo: number,
): GameState {
  const many = Math.max(0, Math.min(upTo, recording.actions.length))
  let state = recording.first

  for (let at = 0; at < many; at += 1) {
    state = applyAction(state, recording.actions[at] as GameAction, random)
  }

  return state
}
