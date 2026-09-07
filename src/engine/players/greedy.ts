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
 * Plays for the regions. Plan task 4.4.
 *
 * Everything Cautious does, plus the one idea that changes how the game is
 * won: a region bonus pays EVERY TURN, so taking the last territory of a
 * region is worth far more than the territory itself. Cautious counts
 * armies. Greedy counts armies and bonuses.
 *
 * Both refuse a fight they are not ahead in, because the defender wins
 * ties and an even fight is a losing one. The difference is which of the
 * winnable fights they pick, and where they put their armies to set the
 * next one up. Cautious reinforces where it is most threatened. Greedy
 * reinforces where the enemy is thinnest, looking for a way through.
 *
 * BE HONEST ABOUT WHAT THIS IS WORTH. Measured over 200 games it wins 94
 * and loses 100 against Cautious. It is a different player, not a better
 * one. Both crush Reckless about 199 to 1.
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
  const advantage = mine - theirs

  // Never take a fight it is not ahead in, region or no region.
  //
  // The first version of this let a region bonus buy a losing fight, on the
  // reasoning that a bonus paid every turn is worth a bad roll. Measured
  // over 40 games it lost to Cautious 13 to 27. Chasing regions into fights
  // it could not win cost it more armies than the bonuses ever paid back.
  //
  // A defender wins ties, so an even fight is a losing fight. Playing for
  // the regions has to mean choosing BETWEEN good attacks, not taking bad
  // ones.
  if (advantage <= 0) {
    return -1
  }

  return (mine / theirs) * RATIO_IS_WORTH + bonusForTaking(state, me, toId) * BONUS_IS_WORTH
}

export const GREEDY: ComputerPlayer = {
  skill: 'greedy',
  name: 'Greedy',
  describe: 'Plays for the regions and pushes where you are thinnest.',

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

    const weakest = Math.min(
      ...neighbours.map((border) => armiesOn(state, border)),
    )

    const nextToAPrize = neighbours.some((border) => nearlyMine.has(border))

    // Put the armies where they can BREAK THROUGH, not where the pressure
    // is worst. A thin enemy beside you is an opening.
    return (
      -weakest * 2 +
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
