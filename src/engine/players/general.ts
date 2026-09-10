import { legalActions } from '../game'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import type { GameState, PlayerId, TerritoryId } from '../types'
import {
  SPREADING,
  armiesOn,
  bordersOf,
  ownedBy,
  pickAmongBest,
  regionHoldings,
  spreadFirst,
} from './board'
import { chooseGoal } from './planner'
import type { Plan } from './planner'
import type { ComputerPlayer } from './types'

/**
 * A player that holds a line. Plan task 4.14.
 *
 * Nick, after playing the other four: "The computer players are too easy
 * to beat." He named four faults, and every one was real:
 *
 * 1. They leave ONE army behind after every attack, so the land they have
 *    just left looks inviting.
 * 2. They ignore a continent somebody else has taken, and carry on as if
 *    every territory were worth the same.
 * 3. They put all their new armies on ONE territory, every turn.
 * 4. Once the front line falls, everything behind it is one army deep, and
 *    goes in a single turn.
 *
 * So this player knows how deep each of its territories is. The front line
 * is held at the strength of the biggest enemy next to it. The line behind
 * holds two. Only land well away from any enemy is left at one. After a
 * capture it leaves behind what the old territory still needs, not one.
 * And a continent in somebody else's hands is the first thing it attacks.
 *
 * It still has a plan, borrowed from the Planner: a region to own, taken
 * and then guarded. Every number below is a setting, tuned by the
 * tournament in players.test.ts.
 */

/**
 * Every number this player plays by, in one place, so each can be changed
 * and measured. See spec S15 and S21. The tournament in players.test.ts is
 * what these were chosen against.
 */
export const GENERAL_SETTINGS = {
  /** What the line behind the front holds. Nick: "at least more than one." */
  secondLine: 2,
  /** Extra on a door into a region we hold, because the bonus rides on it. */
  doorGuard: 2,
  /** A front territory holds this share of the biggest enemy beside it. */
  frontShare: 1,
  /** How much breaking an enemy's continent is worth, per bonus army. */
  breakIsWorth: 6,
  /** How much a territory on our own plan is worth. */
  onPlan: 8,
  /** How much finishing a region of our own is worth, per bonus army. */
  finishIsWorth: 4,
  /** Armies kept on the attack stack beyond what one capture needs. */
  toKeepGoing: 2,
  /**
   * Margin over the defenders for an ordinary attack. BOLDER than the odds
   * table asks, and measured: at 2, a player holding a line attacked too
   * rarely and lost three head-to-head games in four. At 1 it is level.
   * At 0 it throws armies away. Plan task 4.14.
   */
  safeMargin: 1,
  /** Margin for a fight worth an even chance: a card, or a continent. */
  evenMargin: 0,
  /** After a capture, does the old territory keep a second-line garrison? */
  occupyKeepsSecondLine: true,
  /**
   * Nick: "General should still put a very high priority on gaining a card
   * every move." Until it has taken something this turn, an attack is
   * scored mainly on how likely it is to succeed, and this is that weight.
   */
  cardOdds: 10,
  /** How much what a target is worth still counts, before the card is won. */
  cardWorthShare: 0.3,
  /** Turn the card-first scoring off, to measure what it is worth. */
  cardFirst: true,
  /**
   * Nick: "that doesn't mean it needs to be the global policeman... perhaps
   * it can reason that another player will take care of that depending on
   * play order." A continent that somebody else will reach before its
   * owner collects again is worth only this share of breaking it.
   */
  leaveItToOthers: 0.3,
  /**
   * Put the attack stack beside the easiest capture while no card is won.
   * With `cardAllIn`, measured on unseen games: turns ended without a card
   * fell from 13% to 1%, and wins rose from about 60% to 63%.
   */
  cardPlacement: true,
  /**
   * While no card is won, attack as if nothing had to stay behind. The
   * capture itself still leaves a garrison (see `moveIn`), so this spends
   * armies on the card, not the line.
   */
  cardAllIn: true,
}

/**
 * The settings that change when only ONE opponent is left. Plan task 4.15.
 *
 * Nick: "tune it for one-on-one games. It should also switch strategies
 * then when the other players get eliminated and it becomes 1 on 1." With
 * several enemies, a line held everywhere pays, because anybody may come
 * through it. With one, the enemy can only come through where its armies
 * are, and armies spent holding the rest of the line are armies that never
 * attack. Anything not listed here stays as in GENERAL_SETTINGS.
 *
 * Measured head to head on unseen games, 120 per opponent: Greedy 67 - 53,
 * Cautious 85 - 35, Planner 70 - 50. Before, it lost to Greedy 49 - 71.
 * Dropping the extras too (no door guard, nothing spare on the stack)
 * made it WORSE, 44%, and so did attacking at no margin at all.
 */
export const GENERAL_DUEL: Partial<typeof GENERAL_SETTINGS> = {
  // The front holds half the enemy beside it, not all of it.
  frontShare: 0.5,
  // Nothing behind the front: the one enemy is not coming that way.
  secondLine: 1,
  occupyKeepsSecondLine: false,
}

/** The rules in play for this move. Chosen afresh at the start of each. */
let rules: typeof GENERAL_SETTINGS = GENERAL_SETTINGS

/** True when every other player but one is out. */
function oneOpponentLeft(state: GameState): boolean {
  return state.players.filter((each) => !each.isEliminated).length === 2
}

/**
 * The armies free to attack with that make an ordinary attack worth it,
 * against a defender of this size. See `safeMargin`, and the odds table in
 * spec section 11 for what each margin buys.
 */
function toWinWell(defenders: number): number {
  return defenders + rules.safeMargin + (defenders >= 2 ? 1 : 0)
}

/** The same for an even chance. Used when a card or a continent is at stake. */
function toWinEvenly(defenders: number): number {
  return defenders + rules.evenMargin + (defenders <= 2 ? 1 : 0)
}

// ---------------------------------------------------------- reading the line

interface Line {
  /** 1 on the front, 2 just behind it, and so on inwards. */
  readonly depth: ReadonlyMap<TerritoryId, number>
  /** Territories inside a region we hold that border land outside it. */
  readonly doors: ReadonlySet<TerritoryId>
}

function enemiesBeside(
  state: GameState,
  me: PlayerId,
  territoryId: TerritoryId,
): TerritoryId[] {
  return bordersOf(state, territoryId).filter(
    (border) => state.territories[border]?.ownerId !== me,
  )
}

/** The strongest enemy next to a territory, or 0 if there is none. */
function dangerTo(
  state: GameState,
  me: PlayerId,
  territoryId: TerritoryId,
  leavingOut: TerritoryId | null = null,
): number {
  return Math.max(
    0,
    ...enemiesBeside(state, me, territoryId)
      .filter((enemy) => enemy !== leavingOut)
      .map((enemy) => armiesOn(state, enemy)),
  )
}

function readTheLine(state: GameState, me: PlayerId): Line {
  const mine = ownedBy(state, me)
  const depth = new Map<TerritoryId, number>()
  let reached = mine.filter((id) => enemiesBeside(state, me, id).length > 0)

  // Outwards from the front, one step at a time, through our own land.
  for (let step = 1; reached.length > 0; step += 1) {
    const next: TerritoryId[] = []

    for (const id of reached) {
      if (!depth.has(id)) {
        depth.set(id, step)
      }
    }
    for (const id of reached) {
      for (const border of bordersOf(state, id)) {
        if (state.territories[border]?.ownerId === me && !depth.has(border)) {
          next.push(border)
        }
      }
    }
    reached = [...new Set(next)]
  }

  const doors = new Set<TerritoryId>()

  for (const holding of regionHoldings(state, me)) {
    if (holding.missing.length > 0) {
      continue
    }
    for (const territory of state.map.territories) {
      if (
        territory.regionId === holding.regionId &&
        territory.borders.some(
          (border) =>
            state.map.territories.find((each) => each.id === border)
              ?.regionId !== holding.regionId,
        )
      ) {
        doors.add(territory.id)
      }
    }
  }

  return { depth, doors }
}

/**
 * How many armies a territory ought to hold.
 *
 * The front holds as many as the biggest enemy beside it, and a door into
 * one of our regions a little more. The line behind holds two, so a broken
 * front is not the end of everything behind it. Only land well inside
 * holds one.
 */
function wanted(
  state: GameState,
  me: PlayerId,
  line: Line,
  territoryId: TerritoryId,
): number {
  const depth = line.depth.get(territoryId) ?? 99

  if (depth === 1) {
    return (
      Math.max(
        rules.secondLine,
        Math.ceil(dangerTo(state, me, territoryId) * rules.frontShare),
      ) +
      (line.doors.has(territoryId) ? rules.doorGuard : 0)
    )
  }

  return depth === 2 ? rules.secondLine : 1
}

// ------------------------------------------------------- what land is worth

/**
 * The territories of every continent somebody else holds whole, and what
 * breaking each is worth to us.
 *
 * Nick: "if another player has captured a continent they don't seem to do
 * anything about it." Taking back ONE territory of it stops the bonus, so
 * every one of them is worth the whole bonus, every turn it is kept away.
 *
 * But only if nobody else will do it first. See `breakUrgency`.
 */
function theirContinents(state: GameState, me: PlayerId): Map<TerritoryId, number> {
  const prizes = new Map<TerritoryId, number>()

  for (const player of state.players) {
    if (player.id === me || player.isEliminated) {
      continue
    }
    for (const holding of regionHoldings(state, player.id)) {
      if (holding.missing.length > 0) {
        continue
      }

      const worth = holding.bonus * breakUrgency(state, me, player.id, holding.regionId)

      for (const territory of state.map.territories) {
        if (territory.regionId === holding.regionId) {
          prizes.set(territory.id, worth)
        }
      }
    }
  }

  return prizes
}

/** How many armies make a player able to break into a continent. */
const ABLE_TO_BREAK = 3

/**
 * How much it falls to US to break a continent: 1 if it does, less if
 * somebody else will get there first.
 *
 * The owner collects the bonus at the start of its next turn. Every player
 * who moves between us and the owner gets a chance to break it before
 * then. If one of them sits beside the continent with armies to attack
 * with, the job is theirs as much as ours, and we can spend our turn on
 * our own plan. If the owner moves straight after us, we are the last
 * chance, and it is all ours.
 */
export function breakUrgency(
  state: GameState,
  me: PlayerId,
  ownerId: PlayerId,
  regionId: string,
): number {
  const order = state.players.filter((each) => !each.isEliminated).map((each) => each.id)
  const from = order.indexOf(me)
  const between: PlayerId[] = []

  for (let step = 1; step < order.length; step += 1) {
    const next = order[(from + step) % order.length] as PlayerId

    if (next === ownerId) {
      break
    }
    between.push(next)
  }

  const inside = new Set(
    state.map.territories.filter((each) => each.regionId === regionId).map((each) => each.id),
  )
  const someoneElseCan = between.some((playerId) =>
    state.map.territories.some(
      (territory) =>
        !inside.has(territory.id) &&
        state.territories[territory.id]?.ownerId === playerId &&
        armiesOn(state, territory.id) >= ABLE_TO_BREAK &&
        territory.borders.some((border) => inside.has(border)),
    ),
  )

  return someoneElseCan ? GENERAL_SETTINGS.leaveItToOthers : 1
}

interface Worth {
  readonly prizes: ReadonlyMap<TerritoryId, number>
  readonly plan: Plan | null
  readonly finishes: ReadonlyMap<TerritoryId, number>
}

function readTheWorth(state: GameState, me: PlayerId): Worth {
  const finishes = new Map<TerritoryId, number>()

  for (const holding of regionHoldings(state, me)) {
    const last = holding.missing[0]

    if (holding.missing.length === 1 && last !== undefined) {
      finishes.set(last, holding.bonus)
    }
  }

  return { prizes: theirContinents(state, me), plan: chooseGoal(state, me), finishes }
}

/** How much taking this enemy territory is worth, before the odds. */
function worthTaking(worth: Worth, territoryId: TerritoryId): number {
  return (
    (worth.prizes.get(territoryId) ?? 0) * rules.breakIsWorth +
    (worth.finishes.get(territoryId) ?? 0) * rules.finishIsWorth +
    (worth.plan?.missing.includes(territoryId) === true ? rules.onPlan : 0)
  )
}

/** Is this territory worth an even fight, rather than a safe one? */
function worthARisk(worth: Worth, territoryId: TerritoryId): boolean {
  return worth.prizes.has(territoryId) || worth.finishes.has(territoryId)
}

// ------------------------------------------------------------ the player

export const GENERAL: ComputerPlayer = {
  skill: 'general',
  name: 'General',
  describe:
    'Holds a front line with a second line behind it, and breaks up your continents.',

  chooseAction(state: GameState, random: RandomSource): GameAction {
    const actions = legalActions(state)
    const me = state.turn.playerId

    // One opponent left changes the game, so it changes the rules.
    rules = oneOpponentLeft(state) ? { ...GENERAL_SETTINGS, ...GENERAL_DUEL } : GENERAL_SETTINGS

    const trades = actions.filter((each) => each.type === 'tradeCards')

    if (trades.length > 0) {
      return trades[random.nextInt(trades.length)] as GameAction
    }

    const line = readTheLine(state, me)

    const occupy = actions.find((each) => each.type === 'occupy')

    if (occupy !== undefined) {
      return moveIn(state, me, line)
    }

    const worth = readTheWorth(state, me)

    // By the phase, never by what happens to be on offer. In an attack
    // phase with no attack possible, the only thing offered is "stop", and
    // guessing from that once sent a fortify into the attack phase.
    if (state.turn.phase === 'attack') {
      return attackOrStop(state, me, worth, actions, random)
    }

    if (state.turn.phase === 'fortify') {
      return fortify(state, me, line, actions, random)
    }

    return placement(state, me, line, worth, actions)
  },
}

// -------------------------------------------------------------- placing

/**
 * Where the new armies go, and how many at once.
 *
 * Nick: "protect their occupied territories by deploying troops to front
 * lines balanced, not just all on one for a blitzkrieg each time." So first
 * the stack for this turn's attack is set aside, then every weak spot on
 * the front is brought up to strength, and only what is left goes on the
 * stack as well.
 *
 * Asked again after each placement, it must give the same answer to the
 * same board, or the armies would be scattered. It does: the stack is the
 * strongest of our territories beside the best target, which only grows as
 * armies go onto it, and every weak spot only gets stronger.
 */
function placement(
  state: GameState,
  me: PlayerId,
  line: Line,
  worth: Worth,
  actions: readonly GameAction[],
): GameAction {
  const remaining = Math.max(1, state.turn.armiesToPlace)
  const oneAtATime = state.turn.phase === 'setup'
  const allowed = new Set(
    actions.flatMap((each) => (each.type === 'placeArmies' ? [each.territoryId] : [])),
  )
  const place = (territoryId: TerritoryId, count: number): GameAction => ({
    type: 'placeArmies',
    territoryId,
    count: oneAtATime ? 1 : Math.max(1, Math.min(remaining, count)),
  })

  const spread = spreadFirst(state, me, [...allowed], !SPREADING.generalEveryTurn)

  if (spread !== null) {
    return spread
  }

  const attack = bestStack(state, me, worth, allowed)
  const stackNeeds =
    attack === null
      ? 0
      : Math.max(
          0,
          toWinWell(armiesOn(state, attack.toId)) +
            keepBehind(state, me, attack.fromId, attack.toId) +
            rules.toKeepGoing -
            armiesOn(state, attack.fromId),
        )

  // Weak spots on the front, doors first, then the worst outnumbered.
  const weak = [...allowed]
    .filter((id) => line.depth.get(id) === 1)
    .map((id) => ({
      id,
      short: wanted(state, me, line, id) - armiesOn(state, id),
      door: line.doors.has(id),
    }))
    .filter((each) => each.short > 0)
    .sort(
      (one, two) =>
        Number(two.door) - Number(one.door) ||
        two.short - one.short ||
        one.id.localeCompare(two.id),
    )

  const forTheLine = remaining - Math.min(remaining, stackNeeds)
  const weakest = weak[0]

  if (weakest !== undefined && forTheLine > 0) {
    return place(weakest.id, Math.min(forTheLine, weakest.short))
  }

  if (attack !== null) {
    return place(attack.fromId, remaining)
  }

  // Nothing to attack and nothing short: the most threatened front.
  const front = [...allowed].sort(
    (one, two) =>
      dangerTo(state, me, two) - armiesOn(state, two) -
        (dangerTo(state, me, one) - armiesOn(state, one)) ||
      one.localeCompare(two),
  )

  return place(front[0] ?? ([...allowed][0] as TerritoryId), remaining)
}

/**
 * The best target this turn, and the territory to attack it from.
 *
 * The target is chosen by what it is worth and how few defend it, never by
 * how many armies we have beside it. That keeps the choice the same while
 * the armies go down, one placement after another.
 */
function bestStack(
  state: GameState,
  me: PlayerId,
  worth: Worth,
  allowed: ReadonlySet<TerritoryId>,
): { fromId: TerritoryId; toId: TerritoryId } | null {
  let best: { fromId: TerritoryId; toId: TerritoryId; score: number } | null = null

  for (const fromId of allowed) {
    for (const toId of enemiesBeside(state, me, fromId)) {
      const easiest = rules.cardPlacement && !state.turn.hasConquered
      const score = easiest
        ? worthTaking(worth, toId) * rules.cardWorthShare * 3 - armiesOn(state, toId) * 3
        : worthTaking(worth, toId) * 3 - armiesOn(state, toId)
      const better =
        best === null ||
        score > best.score ||
        (score === best.score && toId === best.toId &&
          armiesOn(state, fromId) > armiesOn(state, best.fromId)) ||
        (score === best.score && `${toId}${fromId}` < `${best.toId}${best.fromId}`)

      if (better) {
        best = { fromId, toId, score }
      }
    }
  }

  return best
}

/**
 * What a territory must keep if it attacks this neighbour: enough to face
 * every OTHER enemy beside it. One, if the target is its only enemy.
 */
function keepBehind(
  state: GameState,
  me: PlayerId,
  fromId: TerritoryId,
  toId: TerritoryId,
): number {
  return Math.max(1, dangerTo(state, me, fromId, toId))
}

// -------------------------------------------------------------- attacking

function attackOrStop(
  state: GameState,
  me: PlayerId,
  worth: Worth,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const needACard = !state.turn.hasConquered

  const choices = actions.flatMap((action) => {
    if (action.type !== 'attack') {
      return []
    }

    const theirs = armiesOn(state, action.toId)
    const keep =
      needACard && rules.cardAllIn ? 1 : keepBehind(state, me, action.fromId, action.toId)
    const free = armiesOn(state, action.fromId) - keep + 1
    const safe = free >= toWinWell(theirs)
    const even = free >= toWinEvenly(theirs)
    const bold = even && (needACard || worthARisk(worth, action.toId))

    if (!safe && !bold) {
      return []
    }

    const odds = free / theirs
    const worthIt = worthTaking(worth, action.toId)

    return [
      {
        item: action as GameAction,
        score:
          needACard && rules.cardFirst
            ? // No card yet this turn: the likeliest capture first, and
              // what the target is worth only as a tie-break.
              Math.min(4, odds) * rules.cardOdds +
              worthIt * rules.cardWorthShare +
              (safe ? 2 : 0)
            : // The card is won: now what it is worth leads. The odds
              // count only up to three to one, or a one-army nobody next
              // to a big stack outscored breaking a whole continent.
              worthIt + Math.min(3, odds) * 3 + (safe ? 2 : 0),
      },
    ]
  })

  return pickAmongBest(random, choices) ?? { type: 'endAttackPhase' }
}

/**
 * How many armies move into a territory just taken.
 *
 * Nick: "they always just leave one army behind so they look inviting to
 * attack." So the territory left behind keeps what it still needs, judged
 * on the board as it now stands, and everything else moves up.
 */
function moveIn(state: GameState, me: PlayerId, line: Line): GameAction {
  const move = state.turn.pendingOccupation

  if (move === null) {
    return { type: 'occupy', count: 0 }
  }

  const from = armiesOn(state, move.fromId)
  const stillFacing = enemiesBeside(state, me, move.fromId).length > 0
  const keep =
    stillFacing || rules.occupyKeepsSecondLine
      ? wanted(state, me, line, move.fromId)
      : 1
  // `count` is the total in the new territory, and the minimum is already
  // there, so the old territory now holds `from` and would keep
  // `from + minimum - count`.
  const count = from + move.minimumArmies - keep

  return {
    type: 'occupy',
    count: Math.max(move.minimumArmies, Math.min(move.maximumArmies, count)),
  }
}

// -------------------------------------------------------------- fortifying

/**
 * The one move at the end of a turn.
 *
 * From wherever holds more than it needs, to wherever holds least against
 * what it needs, the front before the line behind it. Land well inside
 * gives up everything but one, because nothing there can fight.
 */
function fortify(
  state: GameState,
  me: PlayerId,
  line: Line,
  actions: readonly GameAction[],
  random: RandomSource,
): GameAction {
  const choices = actions.flatMap((action) => {
    if (action.type !== 'fortify') {
      return []
    }

    const spare = armiesOn(state, action.fromId) - wanted(state, me, line, action.fromId)
    const short = wanted(state, me, line, action.toId) - armiesOn(state, action.toId)
    const toTheFront = line.depth.get(action.toId) === 1
    const count = Math.min(spare, toTheFront ? Math.max(short, spare) : short)

    if (spare <= 0 || short <= 0 || count <= 0) {
      return []
    }

    return [
      {
        item: { ...action, count } as GameAction,
        score: Math.min(spare, short) * (toTheFront ? 3 : 1) + (line.doors.has(action.toId) ? 2 : 0),
      },
    ]
  })

  return pickAmongBest(random, choices) ?? { type: 'skipFortify' }
}
