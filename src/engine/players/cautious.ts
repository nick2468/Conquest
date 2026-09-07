import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState } from '../types'
import { armiesOn, frontierOf, pressureOn } from './board'
import type { ComputerPlayer } from './types'

/**
 * Attacks only when it is ahead, and keeps its armies where they are
 * useful. Plan task 4.3.
 *
 * It fixes two of the three faults Nick named while watching the throwaway
 * player in phase 2:
 *
 * - It reinforces its FRONTIER, never a territory buried inside its own
 *   land, so its armies can always be used.
 * - It fortifies armies FORWARD at the end of a turn, so a reserve never
 *   sits still growing.
 *
 * The third fault it keeps on purpose. It is hesitant: it attacks only with
 * a real advantage. That is what makes it Cautious, and what leaves Greedy
 * somewhere to improve on.
 */

/** Attacks worth making, best first. */
function goodAttacks(state: GameState, actions: readonly GameAction[]) {
  return actions
    .filter((action) => action.type === 'attack')
    .map((action) => {
      const from = action.type === 'attack' ? action.fromId : ''
      const to = action.type === 'attack' ? action.toId : ''

      return {
        action,
        advantage: armiesOn(state, from) - armiesOn(state, to),
      }
    })
    .filter((each) => each.advantage > 0)
    .sort((left, right) => right.advantage - left.advantage)
}

export const CAUTIOUS: ComputerPlayer = {
  skill: 'cautious',
  name: 'Cautious',
  describe: 'Attacks only when it is clearly ahead. Guards its borders.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const actions = legalActions(state)
    const me = state.turn.playerId

    // A player holding five cards is offered nothing else, so this is first.
    const trades = actions.filter((each) => each.type === 'tradeCards')

    if (trades.length > 0) {
      return trades[random.nextInt(trades.length)] as GameAction
    }

    // Commit everything forward. Armies left behind cannot fight.
    const occupy = actions.find((each) => each.type === 'occupy')

    if (occupy !== undefined) {
      return { ...occupy, count: armyLimitFor(state, occupy) }
    }

    const places = actions.filter((each) => each.type === 'placeArmies')

    if (places.length > 0) {
      // Shore up the border under the most pressure. If nothing is on a
      // border, anything will do.
      const onFrontier = places.filter(
        (action) =>
          action.type === 'placeArmies' &&
          frontierOf(state, me).includes(action.territoryId),
      )

      const choices = onFrontier.length > 0 ? onFrontier : places

      const best = choices.reduce((worst, action) =>
        pressureOn(
          state,
          me,
          action.type === 'placeArmies' ? action.territoryId : '',
        ) >
        pressureOn(
          state,
          me,
          worst.type === 'placeArmies' ? worst.territoryId : '',
        )
          ? action
          : worst,
      )

      return best.type === 'placeArmies'
        ? { ...best, count: Math.max(1, state.turn.armiesToPlace) }
        : best
    }

    const attacks = goodAttacks(state, actions)

    if (attacks.length > 0) {
      return attacks[0]?.action as GameAction
    }

    const stop = actions.find((each) => each.type === 'endAttackPhase')

    if (stop !== undefined) {
      return stop
    }

    // Move armies out of somewhere safe and into somewhere that is not.
    const fortifies = actions
      .filter((action) => action.type === 'fortify')
      .map((action) => {
        const fromId = action.type === 'fortify' ? action.fromId : ''
        const toId = action.type === 'fortify' ? action.toId : ''

        return {
          action,
          fromId,
          // Worth doing when the armies are leaving quiet land for a border.
          gain:
            pressureOn(state, me, toId) -
            pressureOn(state, me, fromId) +
            (isQuiet(state, me, fromId) ? 10 : 0),
        }
      })
      .filter((each) => each.gain > 0)
      .sort((left, right) => right.gain - left.gain)

    const move = fortifies[0]

    if (move !== undefined) {
      return {
        ...(move.action as Extract<GameAction, { type: 'fortify' }>),
        count: armyLimitFor(state, move.action),
      }
    }

    return { type: 'skipFortify' }
  },
}

function isQuiet(state: GameState, me: string, territoryId: string): boolean {
  return !frontierOf(state, me).includes(territoryId)
}
