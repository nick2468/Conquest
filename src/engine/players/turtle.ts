import { armyLimitFor, legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState, PlayerId, TerritoryId } from '../types'
import {
  armiesOn,
  bonusForTaking,
  bordersOf,
  frontierOf,
  isFrontier,
  ownedBy,
  pickAmongBest,
  pressureOn,
  spreadFirst,
} from './board'
import { GENERAL } from './general'
import type { ComputerPlayer } from './types'

/**
 * Hides behind big stacks, then comes out late. Plan task 4.23.
 *
 * Nick, after reading the Wikipedia page on Risk: "There are some
 * strategies there, one is even named as Turtle, we should offer it." The
 * page calls it turtling: a player makes itself too costly to knock out,
 * keeps taking a card, and survives to the late game, when it can knock
 * out weakened players one after another.
 *
 * So the Turtle:
 *
 * - piles its armies on the border under the most pressure,
 * - attacks once a turn for its card, and only with a clear margin,
 * - finishes a continent or knocks a player out when either is in reach,
 * - moves as few armies as it can into a capture, so the stack stays home,
 * - and comes out of its shell, playing as the General, once it is clearly
 *   the strongest or only one opponent is left.
 */

/** Every number the Turtle plays by. See spec S15. */
export const TURTLE_SETTINGS = {
  /** An attack for a card needs this many armies free beyond the defenders. */
  cardMargin: 2,
  /** The same for taking the last territory of a continent. */
  finishMargin: 2,
  /** The same for knocking a player out: it wins every card they hold. */
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
  describe: 'Hides behind big stacks, takes one card a turn, and comes out late in the game.',

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

    // By the phase, never by what happens to be on offer. See general.ts.
    switch (state.turn.phase) {
      case 'occupy':
        return moveIn(state, me)
      case 'attack':
        return attackOrStop(state, me, actions, random)
      case 'fortify':
        return fortify(state, me, actions, random)
      default:
        return placement(state, me, actions)
    }
  },
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

/**
 * Where the new armies go. First a share spread over the front, as every
 * computer player does. Then all of the rest onto the border that is most
 * outnumbered. If nothing is outnumbered, onto the stack beside the weakest
 * enemy, ready for this turn's card.
 */
function placement(state: GameState, me: PlayerId, actions: readonly GameAction[]): GameAction {
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

  const [worst] = [...front].sort(
    (one, two) =>
      pressureOn(state, me, two) - pressureOn(state, me, one) || one.localeCompare(two),
  )

  if (worst !== undefined && pressureOn(state, me, worst) > 0) {
    return place(worst)
  }

  return place(cardStack(state, me, front))
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

/**
 * At most three kinds of attack, and nothing else:
 *
 * - a player's last territory, which knocks them out and wins their cards,
 * - the last territory of a continent, which wins its bonus every turn,
 * - and, until one is won this turn, the surest capture, for the card.
 */
function attackOrStop(
  state: GameState,
  me: PlayerId,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const choices = actions.flatMap((action) => {
    if (action.type !== 'attack') {
      return []
    }

    const free = armiesOn(state, action.fromId) - 1
    const theirs = armiesOn(state, action.toId)
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

    if (!state.turn.hasConquered && free >= theirs + TURTLE_SETTINGS.cardMargin) {
      return [{ item: action as GameAction, score: 10 + Math.min(10, free / theirs) }]
    }

    return []
  })

  return pickAmongBest(random, choices) ?? { type: 'endAttackPhase' }
}

/**
 * As few armies as the rules allow go into a capture, so the stack stays
 * where it guards the border. All of them go if the old territory has no
 * enemy left beside it, because armies there could do nothing.
 */
function moveIn(state: GameState, me: PlayerId): GameAction {
  const move = state.turn.pendingOccupation

  if (move === null) {
    return { type: 'occupy', count: 0 }
  }

  const occupy: GameAction = { type: 'occupy', count: move.minimumArmies }

  return isFrontier(state, me, move.fromId)
    ? occupy
    : { type: 'occupy', count: armyLimitFor(state, occupy) }
}

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
