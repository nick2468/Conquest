import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState } from '../types'
import type { ComputerPlayer } from './types'

/**
 * Picks at random from whatever is allowed. Plan task 4.2.
 *
 * It is a poor player and that is the point. Every other player is measured
 * against it, so it has to be honest rather than good: it must never cheat,
 * never stall, and never refuse to play. It plays a legal game badly, which
 * is exactly what a baseline is for.
 */
export const RECKLESS: ComputerPlayer = {
  skill: 'reckless',
  name: 'Reckless',
  describe: 'Picks at random. Attacks anything, defends nothing.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const actions = legalActions(state)

    if (actions.length === 0) {
      // Only happens once the game is over, and the caller should have
      // stopped. Saying so is better than returning something odd.
      throw new Error('Reckless was asked to move with nothing allowed.')
    }

    const action = actions[random.nextInt(actions.length)] as GameAction

    switch (action.type) {
      case 'placeArmies': {
        const most = armyLimitFor(state, action)

        return { ...action, count: 1 + random.nextInt(Math.max(1, most)) }
      }

      case 'occupy': {
        const least = action.count
        const most = armyLimitFor(state, action)

        return {
          ...action,
          count: least + random.nextInt(Math.max(1, most - least + 1)),
        }
      }

      case 'fortify': {
        const most = armyLimitFor(state, action)

        return { ...action, count: 1 + random.nextInt(Math.max(1, most)) }
      }

      default:
        return action
    }
  },
}
