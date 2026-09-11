import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState, PlayerId, TerritoryId } from '../types'
import {
  armiesOn,
  bordersOf,
  frontierOf,
  isFrontier,
  ownedBy,
  pickAmongBest,
  pressureOn,
  spreadFirst,
} from './board'
import type { ComputerPlayer } from './types'

/**
 * Waits to be attacked, then hits back. Plan task 4.28.
 *
 * Nick: "Do we also have a strategy that likes to do counter-attacks
 * instead of frontal assaults?" and then "build the counter-attack player
 * but I would like to know how good that strategy is."
 *
 * An attack costs the attacker too. The stack that just attacked is
 * thinner than it was, and a territory just taken is held by whatever
 * moved in. So this player strengthens its borders and makes no frontal
 * assaults. When somebody attacks it, it strikes back next turn at the
 * stack that attacked it, and takes back what it lost.
 *
 * It still takes a card each turn and any knockout, because those are
 * worth too much to leave.
 *
 * It sees who attacked it in `recentFights`, which the engine keeps for
 * exactly this. It holds no memory of its own. See spec S20.
 */

/** Every number the Counter plays by. See spec S15. */
export const COUNTER_SETTINGS = {
  /**
   * An attack needs this many armies free beyond the defenders. 0 means
   * just more armies than them, which measured best for the Turtle (plan
   * task 4.24).
   */
  margin: 0,
  /** What hitting the stack that attacked us is worth. */
  hitBackIsWorth: 20,
  /** What taking back a territory we lost is worth. */
  retakeIsWorth: 15,
}

export const COUNTER: ComputerPlayer = {
  skill: 'counter',
  name: 'Counter',
  describe: 'Guards its borders, then hits back at whoever attacked it.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const me = state.turn.playerId
    const actions = legalActions(state)
    const trades = actions.filter((each) => each.type === 'tradeCards')

    if (trades.length > 0) {
      return trades[random.nextInt(trades.length)] as GameAction
    }

    const targets = counterTargets(state, me)

    // By the phase, never by what happens to be on offer. See general.ts.
    switch (state.turn.phase) {
      case 'occupy':
        return moveIn(state, me)
      case 'attack':
        return attackOrStop(state, targets, actions, random)
      case 'fortify':
        return fortify(state, me, actions, random)
      default:
        return placement(state, me, targets, actions)
    }
  },
}

/**
 * The territories worth hitting back at, and what each is worth.
 *
 * The stack an enemy attacked us from, if it is still theirs. And a
 * territory they took from us, if they still hold it.
 */
function counterTargets(state: GameState, me: PlayerId): Map<TerritoryId, number> {
  const targets = new Map<TerritoryId, number>()
  const add = (id: TerritoryId, worth: number) =>
    targets.set(id, Math.max(targets.get(id) ?? 0, worth))

  for (const fight of state.recentFights ?? []) {
    if (fight.defenderId !== me || fight.attackerId === me) {
      continue
    }

    if (state.territories[fight.fromId]?.ownerId === fight.attackerId) {
      add(fight.fromId, COUNTER_SETTINGS.hitBackIsWorth)
    }

    if (fight.taken && state.territories[fight.toId]?.ownerId !== me) {
      add(fight.toId, COUNTER_SETTINGS.retakeIsWorth)
    }
  }

  return targets
}

/** True if this territory is the last one its owner holds. */
function isLastOf(state: GameState, territoryId: TerritoryId): boolean {
  const ownerId = state.territories[territoryId]?.ownerId

  return ownerId !== undefined && ownerId !== null && ownedBy(state, ownerId).length === 1
}

// -------------------------------------------------------------- placing

/**
 * Where the new armies go. First a share spread over the front, as every
 * computer player does. Then onto the stack beside the best target to hit
 * back at. With nothing to hit back at, onto the border most outnumbered,
 * or, if none is, beside the weakest enemy, ready for this turn's card.
 */
function placement(
  state: GameState,
  me: PlayerId,
  targets: ReadonlyMap<TerritoryId, number>,
  actions: readonly GameAction[],
): GameAction {
  const allowed = actions.flatMap((each) =>
    each.type === 'placeArmies' ? [each.territoryId] : [],
  )
  const count = state.turn.phase === 'setup' ? 1 : Math.max(1, state.turn.armiesToPlace)
  const place = (territoryId: TerritoryId): GameAction => ({
    type: 'placeArmies',
    territoryId,
    count,
  })

  const spread = spreadFirst(state, me, allowed)

  if (spread !== null) {
    return spread
  }

  const front = allowed.filter((id) => isFrontier(state, me, id))

  if (front.length === 0) {
    return place(allowed[0] as TerritoryId)
  }

  const strike = bestStrike(state, me, targets, front)

  if (strike !== null) {
    return place(strike)
  }

  const [worst] = [...front].sort(
    (one, two) =>
      pressureOn(state, me, two) - pressureOn(state, me, one) || one.localeCompare(two),
  )

  if (worst !== undefined && pressureOn(state, me, worst) > 0) {
    return place(worst)
  }

  return place(besideTheWeakest(state, me, front))
}

/**
 * Our territory to hit back from: beside the most valuable target, and
 * the strongest of ours beside it. Null if no target is beside us.
 */
function bestStrike(
  state: GameState,
  me: PlayerId,
  targets: ReadonlyMap<TerritoryId, number>,
  front: readonly TerritoryId[],
): TerritoryId | null {
  let best: { fromId: TerritoryId; score: number } | null = null

  for (const fromId of front) {
    for (const toId of bordersOf(state, fromId)) {
      const worth = targets.get(toId)

      if (worth === undefined || state.territories[toId]?.ownerId === me) {
        continue
      }

      const score = worth * 10 - armiesOn(state, toId) + armiesOn(state, fromId) / 100

      if (best === null || score > best.score) {
        best = { fromId, score }
      }
    }
  }

  return best?.fromId ?? null
}

/** The front territory beside the weakest enemy, the strongest if tied. */
function besideTheWeakest(state: GameState, me: PlayerId, front: readonly TerritoryId[]): TerritoryId {
  const weakestEnemy = (id: TerritoryId) =>
    Math.min(
      ...bordersOf(state, id)
        .filter((border) => state.territories[border]?.ownerId !== me)
        .map((border) => armiesOn(state, border)),
    )

  return [...front].sort(
    (one, two) =>
      weakestEnemy(one) - weakestEnemy(two) ||
      armiesOn(state, two) - armiesOn(state, one) ||
      one.localeCompare(two),
  )[0] as TerritoryId
}

// ------------------------------------------------------------ attacking

/**
 * Three kinds of attack, and nothing else:
 *
 * - a player's last territory, which knocks them out and wins their cards,
 * - a stack that attacked us, or a territory taken from us,
 * - and, until one is won this turn, the surest capture, for the card.
 */
function attackOrStop(
  state: GameState,
  targets: ReadonlyMap<TerritoryId, number>,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const choices = actions.flatMap((action) => {
    if (action.type !== 'attack') {
      return []
    }

    const free = armiesOn(state, action.fromId) - 1
    const theirs = armiesOn(state, action.toId)
    const odds = Math.min(10, free / theirs)

    if (free < theirs + COUNTER_SETTINGS.margin) {
      return []
    }

    if (isLastOf(state, action.toId)) {
      const owner = state.players.find(
        (each) => each.id === state.territories[action.toId]?.ownerId,
      )

      return [{ item: action as GameAction, score: 100 + (owner?.cards.length ?? 0) * 10 }]
    }

    const worth = targets.get(action.toId)

    if (worth !== undefined) {
      return [{ item: action as GameAction, score: worth + odds }]
    }

    if (!state.turn.hasConquered) {
      return [{ item: action as GameAction, score: 5 + odds }]
    }

    return []
  })

  return pickAmongBest(random, choices) ?? { type: 'endAttackPhase' }
}

/**
 * How many armies move into a capture: all but what the old territory
 * needs to face the enemies still beside it.
 */
function moveIn(state: GameState, me: PlayerId): GameAction {
  const move = state.turn.pendingOccupation

  if (move === null) {
    return { type: 'occupy', count: 0 }
  }

  const stillFacing = Math.max(
    0,
    ...bordersOf(state, move.fromId)
      .filter((id) => state.territories[id]?.ownerId !== me)
      .map((id) => armiesOn(state, id)),
  )
  const keep = Math.max(1, stillFacing)
  // `count` is the total in the new territory, and the minimum is already
  // there, so the old territory now holds `from` and would keep
  // `from + minimum - count`.
  const count = armiesOn(state, move.fromId) + move.minimumArmies - keep

  return {
    type: 'occupy',
    count: Math.max(move.minimumArmies, Math.min(move.maximumArmies, count)),
  }
}

// ----------------------------------------------------------- fortifying

/** Armies inside its land move out to the border most outnumbered. */
function fortify(
  state: GameState,
  me: PlayerId,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const front = new Set(frontierOf(state, me))
  const choices = actions.flatMap((action) => {
    if (
      action.type !== 'fortify' ||
      front.has(action.fromId) ||
      !front.has(action.toId) ||
      armiesOn(state, action.fromId) <= 1
    ) {
      return []
    }

    return [
      {
        item: { ...action, count: armyLimitFor(state, action) } as GameAction,
        score: pressureOn(state, me, action.toId) + armiesOn(state, action.fromId),
      },
    ]
  })

  return pickAmongBest(random, choices) ?? { type: 'skipFortify' }
}
