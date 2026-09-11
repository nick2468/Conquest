import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState, PlayerId, TerritoryId } from '../types'
import {
  armiesOn,
  bonusForTaking,
  bordersOf,
  entrancesTo,
  frontierOf,
  isFrontier,
  ownedBy,
  pickAmongBest,
  pressureOn,
  regionHoldings,
  spreadFirst,
} from './board'
import { GENERAL } from './general'
import { chooseGoal } from './planner'
import type { Plan } from './planner'
import type { ComputerPlayer } from './types'

/**
 * Takes an easy continent, hides in it behind big stacks, then comes out
 * late. Plan tasks 4.23 and 4.24.
 *
 * Nick, after reading the Wikipedia page on Risk: "There are some
 * strategies there, one is even named as Turtle, we should offer it." The
 * page calls it turtling: a player makes itself too costly to knock out,
 * keeps taking a card, and survives to the late game, when it can knock
 * out weakened players one after another.
 *
 * The first Turtle hid wherever it happened to be dealt, and lost to
 * everything but Reckless. Nick: "make it stronger, turtle in an easy
 * continent first." So now it has two halves.
 *
 * Building the shell: it picks the continent the Planner would, near and
 * easy to hold, and attacks into it until it is all ours.
 *
 * Inside the shell:
 *
 * - it piles its armies on the ways in that are under the most pressure,
 * - it attacks once a turn for its card, and only with a clear margin,
 * - it finishes a continent or knocks a player out when either is in reach,
 * - it moves as few armies as it can into a capture outside the shell,
 * - and it comes out, playing as the General, once it is clearly the
 *   strongest or only one opponent is left.
 */

/** Every number the Turtle plays by. See spec S15. */
export const TURTLE_SETTINGS = {
  /**
   * An attack for a card needs `cardRatio` times the defenders, plus
   * `cardMargin`, in armies free to attack with. Nick: "In real-life I
   * don't recall anyone waiting for a 2:1 advantage." Measured in plan task
   * 4.24, four players, 160 games each: just more armies than the defender
   * won 118, two to one won 113, and two more than the defender won 102.
   */
  cardRatio: 1,
  cardMargin: 0,
  /** The margin for an attack into the continent it is making its shell. */
  homeMargin: 1,
  /** The margin for taking the last territory of any continent. */
  finishMargin: 2,
  /** The margin for knocking a player out: it wins every card they hold. */
  knockoutMargin: 1,
  /**
   * It comes out of its shell when its armies are this many times the
   * armies of the strongest other player.
   */
  breakOut: 1.5,
}

export const TURTLE: ComputerPlayer = {
  skill: 'turtle',
  name: 'Turtle',
  describe:
    'Takes an easy continent, hides in it behind big stacks, and comes out late in the game.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const me = state.turn.playerId

    if (outOfTheShell(state, me)) {
      return GENERAL.chooseAction(state, random)
    }

    const actions = legalActions(state)
    const trades = actions.filter((each) => each.type === 'tradeCards')

    if (trades.length > 0) {
      return trades[random.nextInt(trades.length)] as GameAction
    }

    const home = homeOf(state, me)

    // By the phase, never by what happens to be on offer. See general.ts.
    switch (state.turn.phase) {
      case 'occupy':
        return moveIn(state, me, home)
      case 'attack':
        return attackOrStop(state, me, home, actions, random)
      case 'fortify':
        return fortify(state, me, home, actions, random)
      default:
        return placement(state, me, home, actions)
    }
  },
}

// ------------------------------------------------------------- the shell

/**
 * The continent the Turtle lives in. One it holds already, the one with the
 * fewest ways in. Otherwise the one the Planner would go for, which weighs
 * how near, how easy to hold, and how well it pays.
 */
function homeOf(state: GameState, me: PlayerId): Plan | null {
  const held = regionHoldings(state, me)
    .filter((holding) => holding.missing.length === 0)
    .map((holding) => ({ holding, ways: entrancesTo(state.map, holding.regionId) }))
    .sort(
      (one, two) =>
        one.ways.length - two.ways.length ||
        two.holding.bonus - one.holding.bonus ||
        one.holding.regionId.localeCompare(two.holding.regionId),
    )[0]

  if (held !== undefined) {
    return { regionId: held.holding.regionId, missing: [], held: true, entrances: held.ways }
  }

  return chooseGoal(state, me)
}

/** The territories of the shell that face the world outside it. */
function doorsOf(state: GameState, home: Plan | null): Set<TerritoryId> {
  const doors = new Set<TerritoryId>()

  if (home === null || !home.held) {
    return doors
  }

  for (const territory of state.map.territories) {
    if (
      territory.regionId === home.regionId &&
      territory.borders.some((border) => regionOf(state, border) !== home.regionId)
    ) {
      doors.add(territory.id)
    }
  }

  return doors
}

function regionOf(state: GameState, territoryId: TerritoryId): string | undefined {
  return state.map.territories.find((each) => each.id === territoryId)?.regionId
}

/**
 * The next territory of the shell to take, and where to attack it from:
 * the weakest one beside us, from our biggest stack beside it.
 */
function nextForTheShell(
  state: GameState,
  me: PlayerId,
  home: Plan | null,
): { fromId: TerritoryId; toId: TerritoryId } | null {
  if (home === null || home.held) {
    return null
  }

  let best: { fromId: TerritoryId; toId: TerritoryId } | null = null

  for (const toId of [...home.missing].sort()) {
    const fromId = bordersOf(state, toId)
      .filter((id) => state.territories[id]?.ownerId === me)
      .sort((one, two) => armiesOn(state, two) - armiesOn(state, one) || one.localeCompare(two))[0]

    if (fromId !== undefined && (best === null || armiesOn(state, toId) < armiesOn(state, best.toId))) {
      best = { fromId, toId }
    }
  }

  return best
}

/** The armies a player holds, all together. */
function armiesOf(state: GameState, playerId: PlayerId): number {
  return ownedBy(state, playerId).reduce((total, id) => total + armiesOn(state, id), 0)
}

/**
 * True once the Turtle is strong enough, or alone enough, to come out.
 *
 * Alone enough means the others have knocked each other out and one is
 * left. A game that STARTS with two players does not count, or the Turtle
 * would play every one-on-one game as the General.
 */
function outOfTheShell(state: GameState, me: PlayerId): boolean {
  const others = state.players.filter((each) => !each.isEliminated && each.id !== me)

  if (others.length <= 1 && state.players.length > 2) {
    return true
  }

  const strongest = Math.max(...others.map((each) => armiesOf(state, each.id)))

  return armiesOf(state, me) >= strongest * TURTLE_SETTINGS.breakOut
}

// -------------------------------------------------------------- placing

/**
 * Where the new armies go. First a share spread over the front, as every
 * computer player does. While the shell is being built, the rest go on the
 * stack for its next territory. Once it is built, onto the way in that is
 * most outnumbered, or, if none is, onto the stack for this turn's card.
 */
function placement(
  state: GameState,
  me: PlayerId,
  home: Plan | null,
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

  const building = nextForTheShell(state, me, home)

  if (building !== null && allowed.includes(building.fromId)) {
    return place(building.fromId)
  }

  const doors = doorsOf(state, home)
  const guarded = front.filter((id) => doors.has(id))
  const pool = guarded.length > 0 ? guarded : front

  const [worst] = [...pool].sort(
    (one, two) =>
      pressureOn(state, me, two) - pressureOn(state, me, one) || one.localeCompare(two),
  )

  if (worst !== undefined && pressureOn(state, me, worst) > 0) {
    return place(worst)
  }

  return place(cardStack(state, me, pool))
}

/** The front territory beside the weakest enemy, the strongest if tied. */
function cardStack(state: GameState, me: PlayerId, front: readonly TerritoryId[]): TerritoryId {
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
 * Four kinds of attack, and nothing else:
 *
 * - a player's last territory, which knocks them out and wins their cards,
 * - the last territory of a continent, which wins its bonus every turn,
 * - a territory of the shell while it is still being built,
 * - and, until one is won this turn, the surest capture, for the card.
 */
function attackOrStop(
  state: GameState,
  me: PlayerId,
  home: Plan | null,
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
    const ownerId = state.territories[action.toId]?.ownerId
    const owner = state.players.find((each) => each.id === ownerId)

    if (
      owner !== undefined &&
      ownedBy(state, owner.id).length === 1 &&
      free >= theirs + TURTLE_SETTINGS.knockoutMargin
    ) {
      return [{ item: action as GameAction, score: 100 + owner.cards.length * 10 }]
    }

    const bonus = bonusForTaking(state, me, action.toId)

    if (bonus > 0 && free >= theirs + TURTLE_SETTINGS.finishMargin) {
      return [{ item: action as GameAction, score: 50 + bonus }]
    }

    if (
      home !== null &&
      home.missing.includes(action.toId) &&
      free >= theirs + TURTLE_SETTINGS.homeMargin
    ) {
      return [{ item: action as GameAction, score: 30 + odds }]
    }

    if (
      !state.turn.hasConquered &&
      free >= theirs * TURTLE_SETTINGS.cardRatio + TURTLE_SETTINGS.cardMargin
    ) {
      return [{ item: action as GameAction, score: 10 + odds }]
    }

    return []
  })

  return pickAmongBest(random, choices) ?? { type: 'endAttackPhase' }
}

/**
 * How many armies move into a capture.
 *
 * Into the shell while it is being built: all of them, to push on through
 * it. Anywhere else: as few as the rules allow, so the stack stays where it
 * guards the border. All of them too if the old territory has no enemy
 * left beside it, because armies there could do nothing.
 */
function moveIn(state: GameState, me: PlayerId, home: Plan | null): GameAction {
  const move = state.turn.pendingOccupation

  if (move === null) {
    return { type: 'occupy', count: 0 }
  }

  const least: GameAction = { type: 'occupy', count: move.minimumArmies }
  const most: GameAction = { type: 'occupy', count: armyLimitFor(state, least) }
  const intoTheShell = home !== null && !home.held && regionOf(state, move.toId) === home.regionId

  return intoTheShell || !isFrontier(state, me, move.fromId) ? most : least
}

// ----------------------------------------------------------- fortifying

/** Armies inside its land move out to the border most outnumbered. */
function fortify(
  state: GameState,
  me: PlayerId,
  home: Plan | null,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const front = new Set(frontierOf(state, me))
  const doors = doorsOf(state, home)
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
        score:
          pressureOn(state, me, action.toId) +
          armiesOn(state, action.fromId) +
          (doors.has(action.toId) ? 5 : 0),
      },
    ]
  })

  return pickAmongBest(random, choices) ?? { type: 'skipFortify' }
}
