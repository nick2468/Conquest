import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState } from '../types'
import {
  armiesOn,
  bonusForTaking,
  frontierOf,
  pickAmongBest,
  pressureOn,
  regionHoldings,
} from './board'
import type { ComputerPlayer } from './types'

/**
 * Plays Risk the way Risk is meant to be played. Plan tasks 4.4 and 4.7.
 *
 * Built from published strategy rather than from first principles, after
 * six attempts at reasoning it out all failed to beat Cautious. The two
 * rules that matter, and they only work together:
 *
 * 1. **Take at least one territory every turn, to earn a card.** Risk is a
 *    card game before it is a map game. A set is worth 4 armies early and
 *    far more later, so a turn without a card is a turn thrown away.
 * 2. **Take a level fight when a card is at stake**, where Cautious wants
 *    more armies than the defender.
 *
 * The published advice is to attack only at two to one. On a full Risk
 * board that is right. On ten territories it is paralysing, and it was
 * measured: 32 to 86 against Cautious, with two such players deadlocking
 * 31 games out of 60. The rule that transfers is the card rule. The
 * two-to-one rule does not.
 *
 * Region bonuses are a tie-break, not a goal. Published strategy is clear
 * that holding a region matters less as the cards grow, and every version
 * of this player that chased regions harder played worse.
 */

/** What a region bonus is worth compared to one army, roughly. */
const BONUS_IS_WORTH = 4

/** How much to weigh how lopsided a fight is. */
const RATIO_IS_WORTH = 5

/** How much to prefer finishing a region over starting a new one. */
const NEARLY_MINE = 3

/**
 * The ordinary bar: more armies than them.
 *
 * Published strategy says two to one, and on a full Risk board it is right.
 * On this ten-territory map it is paralysing: measured 32 to 86 against
 * Cautious in a two-player game, and two such players deadlocked 31 games
 * out of 60. A small board does not offer two-to-one fights.
 */
function ahead(mine: number, theirs: number): boolean {
  return mine > theirs
}

/**
 * The lower bar, used when a card is the prize or when nothing else is on
 * offer. A level fight, which the spec odds table puts at about even.
 */
function level(mine: number, theirs: number): boolean {
  return mine >= theirs
}

/**
 * How often it takes a fair fight when no safe one is on offer.
 *
 * Nick's idea, and it fixes something neither player could fix alone. Two
 * careful players facing each other make the same careful decision every
 * turn, so nothing ever changes and the game runs forever. A player that
 * sometimes takes a fight it only PROBABLY wins breaks that, because the
 * two stop mirroring each other.
 *
 * It only fires when nothing safe is available, so it costs almost nothing
 * in an ordinary game and only shows up in the stuck ones.
 */
const BOLDNESS_PERCENT = 25

function scoreAttack(
  state: GameState,
  me: string,
  fromId: string,
  toId: string,
  needACard: boolean,
): number {
  const mine = armiesOn(state, fromId)
  const theirs = armiesOn(state, toId)

  const allowed = needACard ? level(mine, theirs) : ahead(mine, theirs)

  if (!allowed) {
    return -1
  }

  return (
    (mine / theirs) * RATIO_IS_WORTH +
    bonusForTaking(state, me, toId) * BONUS_IS_WORTH
  )
}

export const GREEDY: ComputerPlayer = {
  skill: 'greedy',
  name: 'Greedy',
  describe:
    'Takes a card every turn, then only fights at two to one.',

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
        ...(bestPlacement(state, me, places, random) as Extract<
          GameAction,
          { type: 'placeArmies' }
        >),
        count: Math.max(1, state.turn.armiesToPlace),
      }
    }

    // No card yet this turn? Then the cheapest capture on the board is worth
    // more than any careful sum, because the card is the real prize.
    const needACard = !state.turn.hasConquered

    const attacks = actions
      .filter((action) => action.type === 'attack')
      .map((action) => ({
        action,
        score: scoreAttack(
          state,
          me,
          action.type === 'attack' ? action.fromId : '',
          action.type === 'attack' ? action.toId : '',
          needACard,
        ),
      }))
      .filter((each) => each.score > 0)
      .sort((left, right) => right.score - left.score)

    const best = pickAmongBest(
      random,
      attacks.map((each) => ({ item: each.action, score: each.score })),
    )

    if (best !== undefined) {
      return best
    }

    // Nothing safe on offer. Sometimes take a fair fight rather than sit
    // still, because sitting still is how two careful players deadlock.
    if (random.nextInt(100) < BOLDNESS_PERCENT) {
      const fair = actions
        .filter((action) => {
          if (action.type !== 'attack') {
            return false
          }

          return level(
            armiesOn(state, action.fromId),
            armiesOn(state, action.toId),
          )
        })
        .sort(
          (left, right) =>
            scoreAttack(
              state,
              me,
              right.type === 'attack' ? right.fromId : '',
              right.type === 'attack' ? right.toId : '',
              true,
            ) -
            scoreAttack(
              state,
              me,
              left.type === 'attack' ? left.fromId : '',
              left.type === 'attack' ? left.toId : '',
              true,
            ),
        )

      if (fair[0] !== undefined) {
        return fair[0]
      }
    }

    const stop = actions.find((each) => each.type === 'endAttackPhase')

    if (stop !== undefined) {
      return stop
    }

    return bestFortify(state, me, actions, random)
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
  random: RandomSource,
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

  return (
    pickAmongBest(
      random,
      choices.map((action) => ({ item: action, score: value(action) })),
    ) ?? (choices[0] as GameAction)
  )
}

/** Move armies from wherever they are idle to wherever they are needed. */
function bestFortify(
  state: GameState,
  me: string,
  actions: readonly GameAction[],
  random: RandomSource,
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

  const move = pickAmongBest(
    random,
    moves.map((each) => ({ item: each.action, score: each.gain })),
  )

  if (move === undefined) {
    return { type: 'skipFortify' }
  }

  return {
    ...(move as Extract<GameAction, { type: 'fortify' }>),
    count: armyLimitFor(state, move),
  }
}
