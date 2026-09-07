import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState } from '../types'
import {
  armiesOn,
  bonusForTaking,
  frontierOf,
  pressureOn,
  regionHoldings,
} from './board'
import type { ComputerPlayer } from './types'

/**
 * A bolder player that plays for the regions. Plan task 4.4.
 *
 * Two differences from Cautious, and only two:
 *
 * 1. It attacks when it is level or ONE army behind, where Cautious wants a
 *    clear lead. With three dice against two the attacker is favoured per
 *    exchange, so a level fight is not the losing proposition it looks.
 * 2. Among the fights worth taking, it prefers the one that completes a
 *    region, because a region bonus is paid every turn from then on.
 *
 * IT IS NOT STRONGER THAN CAUTIOUS, and plan task 4.7 records the many ways
 * that was tried and failed. Measured over 800 games on four separate seed
 * ranges it wins 401 and loses 393. It is a different player, not a better
 * one, and the description on the new game screen says so.
 */

/** What a region bonus is worth compared to one army, roughly. */
const BONUS_IS_WORTH = 4

/** How much to weigh how lopsided a fight is. */
const RATIO_IS_WORTH = 5

/** How much to prefer finishing a region over starting a new one. */
const NEARLY_MINE = 3

function scoreAttack(
  state: GameState,
  me: string,
  fromId: string,
  toId: string,
): number {
  const mine = armiesOn(state, fromId)
  const theirs = armiesOn(state, toId)

  // Bolder than Cautious by exactly one army.
  if (mine + 1 < theirs) {
    return -1
  }

  // Among the fights worth taking, prefer the lopsided ones, and prefer the
  // one that finishes a region above all.
  return (
    (mine / theirs) * RATIO_IS_WORTH +
    bonusForTaking(state, me, toId) * BONUS_IS_WORTH
  )
}

export const GREEDY: ComputerPlayer = {
  skill: 'greedy',
  name: 'Greedy',
  describe:
    'Bolder than Cautious, and plays for the regions. About as strong.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const actions = legalActions(state)
    const me = state.turn.playerId

    const trades = actions.filter((each) => each.type === 'tradeCards')

    if (trades.length > 0) {
      return trades[random.nextInt(trades.length)] as GameAction
    }

    const occupy = actions.find((each) => each.type === 'occupy')

    if (occupy !== undefined) {
      return { ...occupy, count: armyLimitFor(state, occupy) }
    }

    const places = actions.filter((each) => each.type === 'placeArmies')

    if (places.length > 0) {
      return {
        ...(bestPlacement(state, me, places) as Extract<
          GameAction,
          { type: 'placeArmies' }
        >),
        count: Math.max(1, state.turn.armiesToPlace),
      }
    }

    const attacks = actions
      .filter((action) => action.type === 'attack')
      .map((action) => ({
        action,
        score: scoreAttack(
          state,
          me,
          action.type === 'attack' ? action.fromId : '',
          action.type === 'attack' ? action.toId : '',
        ),
      }))
      .filter((each) => each.score > 0)
      .sort((left, right) => right.score - left.score)

    const best = attacks[0]

    if (best !== undefined) {
      return best.action
    }

    const stop = actions.find((each) => each.type === 'endAttackPhase')

    if (stop !== undefined) {
      return stop
    }

    return bestFortify(state, me, actions)
  },
}

/**
 * Where the new armies go.
 *
 * A border beside the last territory of a region comes first, because that
 * is where the next bonus is won. After that, whichever border is under the
 * most pressure.
 */
function bestPlacement(
  state: GameState,
  me: string,
  places: readonly GameAction[],
): GameAction {
  const frontier = frontierOf(state, me)

  const onFrontier = places.filter(
    (action) =>
      action.type === 'placeArmies' && frontier.includes(action.territoryId),
  )

  const choices = onFrontier.length > 0 ? onFrontier : places

  const nearlyMine = new Set(
    regionHoldings(state, me)
      .filter((each) => each.missing.length > 0 && each.missing.length <= 2)
      .flatMap((each) => each.missing),
  )

  const value = (action: GameAction): number => {
    if (action.type !== 'placeArmies') {
      return -Infinity
    }

    const neighbours = (
      state.map.territories.find((each) => each.id === action.territoryId)
        ?.borders ?? []
    ).filter((border) => state.territories[border]?.ownerId !== me)

    const nextToAPrize = neighbours.some((border) => nearlyMine.has(border))

    // Put the armies where they can BREAK THROUGH, not where the pressure
    // is worst. A thin enemy beside you is an opening.
    return (
      pressureOn(state, me, action.territoryId) +
      (nextToAPrize ? NEARLY_MINE * BONUS_IS_WORTH : 0)
    )
  }

  return choices.reduce((best, action) =>
    value(action) > value(best) ? action : best,
  )
}

/** Move armies from wherever they are idle to wherever they are needed. */
function bestFortify(
  state: GameState,
  me: string,
  actions: readonly GameAction[],
): GameAction {
  const frontier = frontierOf(state, me)

  const moves = actions
    .filter((action) => action.type === 'fortify')
    .map((action) => {
      const fromId = action.type === 'fortify' ? action.fromId : ''
      const toId = action.type === 'fortify' ? action.toId : ''

      return {
        action,
        gain:
          pressureOn(state, me, toId) -
          pressureOn(state, me, fromId) +
          (frontier.includes(fromId) ? 0 : 12) +
          (frontier.includes(toId) ? 6 : 0),
      }
    })
    .filter((each) => each.gain > 0)
    .sort((left, right) => right.gain - left.gain)

  const move = moves[0]

  if (move === undefined) {
    return { type: 'skipFortify' }
  }

  return {
    ...(move.action as Extract<GameAction, { type: 'fortify' }>),
    count: armyLimitFor(state, move.action),
  }
}
