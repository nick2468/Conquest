import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState, RegionId, TerritoryId } from '../types'
import {
  armiesOn,
  entrancesTo,
  frontierOf,
  pickAmongBest,
  pressureOn,
  regionHoldings,
} from './board'
import type { ComputerPlayer } from './types'

/**
 * A player with a plan. Plan task 4.13.
 *
 * Nick's point: real players do not just react. They pick a base, take it,
 * hold it, and push out from there. "I am going for Australia" is a
 * decision that lasts many turns and shapes every move inside them. The
 * three players before this one had no memory and no goal. Every turn they
 * decided again from nothing, which is why the region preference in Greedy
 * never paid: it only ever noticed a region that was already one attack
 * from finished. It never worked TOWARDS one.
 *
 * So this one picks a region to own, and then everything serves it. It
 * attacks into the region first, reinforces where it can attack from, and
 * once it holds the region it guards the ways in rather than wandering off.
 *
 * The goal is worked out from the board each turn rather than remembered.
 * That keeps the seam of spec S20 exactly as it was: a player is asked for
 * one action and answers, holding nothing between calls. It also behaves
 * better than a memory would. The plan holds while the board holds, and
 * changes the moment the board says it should, which is what a person does.
 */

/** What the plan is, this turn. */
export interface Plan {
  readonly regionId: RegionId
  /** Territories in it that somebody else holds. */
  readonly missing: readonly TerritoryId[]
  /** True once every territory in it is ours. */
  readonly held: boolean
  /** The ways in, which are what needs guarding once it is held. */
  readonly entrances: readonly TerritoryId[]
}

/** How much one bonus army per turn is worth against one army now. */
const BONUS_IS_WORTH = 8

/** What each territory still to take costs the plan. */
const STEP_COSTS = 5

/** What each way in costs, because every one must be held from then on. */
const ENTRANCE_COSTS = 4

/** How strongly to prefer a move that serves the plan. */
const ON_PLAN = 10

/**
 * Pick the region to go for.
 *
 * A near, well-paying, easily held region beats a far, poorly paying, leaky
 * one. The weight on entrances is what makes this player favour a corner of
 * the map, exactly as people favour Australia or South America in the real
 * game: not because they are rich, but because they have one door.
 */
export function chooseGoal(state: GameState, me: string): Plan | null {
  const scored = regionHoldings(state, me).map((holding) => {
    const entrances = entrancesTo(state.map, holding.regionId)
    const defenders = holding.missing.reduce(
      (total, id) => total + armiesOn(state, id),
      0,
    )

    const plan: Plan = {
      regionId: holding.regionId,
      missing: holding.missing,
      held: holding.missing.length === 0,
      entrances,
    }

    return {
      plan,
      score:
        holding.bonus * BONUS_IS_WORTH -
        holding.missing.length * STEP_COSTS -
        entrances.length * ENTRANCE_COSTS -
        defenders,
    }
  })

  if (scored.length === 0) {
    return null
  }

  // Deliberately NOT chosen at random. A plan that changed every turn would
  // not be a plan. Everything else this player does varies; this does not.
  return scored.reduce((best, each) => (each.score > best.score ? each : best))
    .plan
}

function serves(plan: Plan | null, territoryId: TerritoryId): boolean {
  return plan !== null && plan.missing.includes(territoryId)
}

function bordersOf(state: GameState, territoryId: TerritoryId): string[] {
  return [
    ...(state.map.territories.find((each) => each.id === territoryId)
      ?.borders ?? []),
  ]
}

export const PLANNER: ComputerPlayer = {
  skill: 'planner',
  name: 'Planner',
  describe: 'Picks a region to own, takes it, then holds the ways in.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const actions = legalActions(state)
    const me = state.turn.playerId
    const plan = chooseGoal(state, me)

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
      const chosen =
        pickAmongBest(
          random,
          places.map((action) => ({
            item: action,
            score: placementValue(state, me, plan, action),
          })),
        ) ?? (places[0] as GameAction)

      return chosen.type === 'placeArmies'
        ? { ...chosen, count: Math.max(1, state.turn.armiesToPlace) }
        : chosen
    }

    const needACard = !state.turn.hasConquered

    const attack = pickAmongBest(
      random,
      actions
        .filter((action) => action.type === 'attack')
        .map((action) => ({
          item: action,
          score: attackValue(state, plan, action, needACard),
        }))
        .filter((each) => each.score > 0),
    )

    if (attack !== undefined) {
      return attack
    }

    const stop = actions.find((each) => each.type === 'endAttackPhase')

    if (stop !== undefined) {
      return stop
    }

    return fortifyTowardsThePlan(state, me, plan, actions, random)
  },
}

function attackValue(
  state: GameState,
  plan: Plan | null,
  action: GameAction,
  needACard: boolean,
): number {
  if (action.type !== 'attack') {
    return -1
  }

  const mine = armiesOn(state, action.fromId)
  const theirs = armiesOn(state, action.toId)

  // Level is enough when a card is at stake, ahead otherwise. Both rules
  // came from Greedy, measured in plan task 4.9.
  const allowed = needACard ? mine >= theirs : mine > theirs

  if (!allowed) {
    return -1
  }

  return (mine / theirs) * 5 + (serves(plan, action.toId) ? ON_PLAN : 0)
}

/**
 * Where the new armies go.
 *
 * Before the region is held, they go where they can attack INTO it. After
 * it is held, they go to the doors, because a region you cannot hold pays
 * nothing at all.
 */
function placementValue(
  state: GameState,
  me: string,
  plan: Plan | null,
  action: GameAction,
): number {
  if (action.type !== 'placeArmies') {
    return -Infinity
  }

  const onFrontier = frontierOf(state, me).includes(action.territoryId)
  const pressure = pressureOn(state, me, action.territoryId)
  const nearby = bordersOf(state, action.territoryId)

  if (plan === null) {
    return pressure + (onFrontier ? 10 : 0)
  }

  const worthMore = plan.held
    ? nearby.some((border) => plan.entrances.includes(border))
    : nearby.some((border) => serves(plan, border))

  return pressure + (worthMore ? ON_PLAN : 0) + (onFrontier ? 10 : 0)
}

function fortifyTowardsThePlan(
  state: GameState,
  me: string,
  plan: Plan | null,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const frontier = frontierOf(state, me)

  const move = pickAmongBest(
    random,
    actions
      .filter((action) => action.type === 'fortify')
      .map((action) => {
        if (action.type !== 'fortify') {
          return { item: action, score: -1 }
        }

        const nearby = bordersOf(state, action.toId)
        const towardsThePlan = nearby.some(
          (border) =>
            serves(plan, border) || plan?.entrances.includes(border) === true,
        )

        return {
          item: action as GameAction,
          score:
            pressureOn(state, me, action.toId) -
            pressureOn(state, me, action.fromId) +
            (frontier.includes(action.fromId) ? 0 : 12) +
            (towardsThePlan ? ON_PLAN : 0),
        }
      })
      .filter((each) => each.score > 0),
  )

  if (move === undefined) {
    return { type: 'skipFortify' }
  }

  return {
    ...(move as Extract<GameAction, { type: 'fortify' }>),
    count: armyLimitFor(state, move),
  }
}
