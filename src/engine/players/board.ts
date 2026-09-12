import { RISING_SET_CAP } from '../balance'
import { risingValueOf } from '../cards'
import type { GameAction } from '../game'
import type { RandomSource } from '../random'
import { reinforcementsFor } from '../reinforce'
import type {
  GameMap,
  GameState,
  PlayerId,
  RegionId,
  TerritoryId,
} from '../types'

/**
 * Reading the board, as a computer player needs to see it.
 *
 * None of this decides anything. It answers questions about the position,
 * and the players decide what those answers are worth. Keeping the two
 * apart means the same reading can serve every player, and can be tested
 * without running a game.
 */

export function bordersOf(
  state: GameState,
  territoryId: TerritoryId,
): readonly TerritoryId[] {
  return (
    state.map.territories.find((each) => each.id === territoryId)?.borders ?? []
  )
}

export function ownedBy(state: GameState, playerId: PlayerId): TerritoryId[] {
  return Object.keys(state.territories).filter(
    (id) => state.territories[id]?.ownerId === playerId,
  )
}

export function armiesOn(state: GameState, territoryId: TerritoryId): number {
  return state.territories[territoryId]?.armies ?? 0
}

/** True if anybody else owns a territory next to this one. */
export function isFrontier(
  state: GameState,
  playerId: PlayerId,
  territoryId: TerritoryId,
): boolean {
  return bordersOf(state, territoryId).some(
    (border) => state.territories[border]?.ownerId !== playerId,
  )
}

/**
 * The territories where this player touches somebody else.
 *
 * Armies anywhere else can do nothing this turn. That is the whole reason
 * this function exists: a player that reinforces away from its frontier
 * builds a pile that never fights.
 */
export function frontierOf(state: GameState, playerId: PlayerId): TerritoryId[] {
  return ownedBy(state, playerId).filter((id) =>
    isFrontier(state, playerId, id),
  )
}

/** Owned territories with no enemy anywhere next to them. */
export function interiorOf(state: GameState, playerId: PlayerId): TerritoryId[] {
  return ownedBy(state, playerId).filter(
    (id) => !isFrontier(state, playerId, id),
  )
}

/** How much of a region a player holds. */
export interface RegionHolding {
  readonly regionId: RegionId
  readonly bonus: number
  readonly owned: number
  readonly total: number
  /** Territories in this region the player does NOT hold. */
  readonly missing: readonly TerritoryId[]
}

export function regionHoldings(
  state: GameState,
  playerId: PlayerId,
): RegionHolding[] {
  return state.map.regions.map((region) => {
    const inRegion = state.map.territories.filter(
      (each) => each.regionId === region.id,
    )

    const missing = inRegion
      .filter((each) => state.territories[each.id]?.ownerId !== playerId)
      .map((each) => each.id)

    return {
      regionId: region.id,
      bonus: region.bonus,
      owned: inRegion.length - missing.length,
      total: inRegion.length,
      missing,
    }
  })
}

/**
 * How far the board has coalesced, from 0 to 1. Plan task 4.43.
 *
 * Nick: "the game starts with a random distribution but starts to coalesce
 * into clusters. So it's not just about 1 vs 1, it will also depend on how
 * much coalescing has happened."
 *
 * It is the share of borders on the map that join two territories with the
 * SAME owner. Just after the deal that is near zero: everybody's land is
 * scattered, nobody has a front line, and every territory touches an enemy.
 * Late in a game it is high: a few blocks with real borders between them.
 *
 * It needs no memory and no history, so it obeys spec S20 like everything
 * else a player may ask.
 */
export function boardMaturity(state: GameState): number {
  const alive = state.players.filter((each) => !each.isEliminated).length

  if (alive < 2) {
    return 1
  }

  // With this many players, a random deal already joins about this share of
  // borders by luck alone. Two players start halfway up the raw measure.
  const byLuck = 1 / alive
  const grown = (howClustered(state) - byLuck) / (1 - byLuck)

  return Math.min(1, Math.max(0, grown))
}

/**
 * The raw share of borders joining two territories of the same owner. Use
 * `boardMaturity` to compare one game with another.
 */
export function howClustered(state: GameState): number {
  let together = 0
  let borders = 0

  for (const territory of state.map.territories) {
    for (const other of territory.borders) {
      // Each border once, not once from each end.
      if (other <= territory.id) continue

      borders += 1
      if (state.territories[territory.id]?.ownerId === state.territories[other]?.ownerId) {
        together += 1
      }
    }
  }

  return borders === 0 ? 0 : together / borders
}

/** Three cards make a set. */
const CARDS_IN_A_SET = 3

/** The average fixed set: infantry 4, cavalry 6, artillery 8, mixed 10. */
const AVERAGE_FIXED_SET = 7

/**
 * What one card in a hand is worth in armies, right now. Plan task 4.41.
 *
 * Nick: "the prize also scales according to how much a set is worth in the
 * rising redemption version, early card sets are less valuable than later
 * ones which might be worth 20 armies." So the cards a knockout wins are
 * worth about 1.3 armies each in the first minutes of a game and nearly 7
 * once sets are worth 20.
 */
export function armiesPerCard(state: GameState): number {
  const next =
    state.options.cardSetValue === 'fixed'
      ? AVERAGE_FIXED_SET
      : risingValueOf(state.deck.setsTraded, state.options.risingSetCap ?? RISING_SET_CAP)

  return next / CARDS_IN_A_SET
}

/**
 * The opponent running away with the game, or null if nobody is. Plan task
 * 4.38.
 *
 * Nick: "players should assess if one player is getting too much of a lead
 * and increase the priority of attacking that player to knock him back to
 * size." A runaway is an opponent drawing at least `lead` times the armies
 * a turn that we draw. Income is the measure, not territories, because a
 * continent pays every turn and that is how a lead becomes unbeatable.
 *
 * One player leaning on the leader alone only spends its own armies on the
 * best defended player. It takes several doing it at once, which is why
 * every thinking player asks this question.
 */
export function runawayLeader(
  state: GameState,
  me: PlayerId,
  lead: number,
): PlayerId | null {
  const income = (playerId: PlayerId) =>
    reinforcementsFor(state.map, state.territories, playerId)
  const others = state.players.filter((each) => !each.isEliminated && each.id !== me)
  const leader = others.reduce<PlayerId | null>(
    (best, each) => (best === null || income(each.id) > income(best) ? each.id : best),
    null,
  )

  return leader !== null && income(leader) >= income(me) * lead ? leader : null
}

/**
 * True if this is the last territory its owner holds, so taking it knocks
 * them out and wins every card they hold. Plan task 4.34.
 *
 * Nick saw a player walk past one: it "loaded up next door but then
 * proceeded to attack elsewhere... he should have killed Greedy as a
 * priority."
 */
export function isTheirLast(state: GameState, territoryId: TerritoryId): boolean {
  const ownerId = state.territories[territoryId]?.ownerId

  return (
    ownerId !== undefined && ownerId !== null && ownedBy(state, ownerId).length === 1
  )
}

/**
 * How much taking this territory would be worth, in bonus armies per turn.
 *
 * Taking the LAST territory of a region is worth the whole region bonus,
 * every turn from then on. Taking any other territory in that region is
 * worth nothing yet. That step change is the main thing a good player
 * understands and a poor one does not.
 */
export function bonusForTaking(
  state: GameState,
  playerId: PlayerId,
  territoryId: TerritoryId,
): number {
  const region = state.map.territories.find(
    (each) => each.id === territoryId,
  )?.regionId

  if (region === undefined) {
    return 0
  }

  const holding = regionHoldings(state, playerId).find(
    (each) => each.regionId === region,
  )

  if (holding === undefined) {
    return 0
  }

  return holding.missing.length === 1 && holding.missing[0] === territoryId
    ? holding.bonus
    : 0
}

/**
 * How badly a territory is outnumbered by what sits next to it.
 *
 * Positive means the enemies beside it hold more armies than it does. The
 * bigger the number, the more it needs help.
 */
export function pressureOn(
  state: GameState,
  playerId: PlayerId,
  territoryId: TerritoryId,
): number {
  const against = bordersOf(state, territoryId)
    .filter((border) => state.territories[border]?.ownerId !== playerId)
    .reduce((total, border) => total + armiesOn(state, border), 0)

  return against - armiesOn(state, territoryId)
}

/**
 * The territories OUTSIDE a region that border into it.
 *
 * This is what a region costs to hold. In the real board game Australia is
 * the favourite base because it has exactly one way in. On our map The West
 * has two, which makes it the same kind of prize.
 */
export function entrancesTo(
  map: GameMap,
  regionId: RegionId,
): TerritoryId[] {
  const inside = new Set(
    map.territories
      .filter((each) => each.regionId === regionId)
      .map((each) => each.id),
  )

  const ways = new Set<TerritoryId>()

  for (const territory of map.territories) {
    if (inside.has(territory.id)) {
      continue
    }

    if (territory.borders.some((border) => inside.has(border))) {
      ways.add(territory.id)
    }
  }

  return [...ways]
}

/** Something to choose, with how good it looks. */
export interface Scored<Item> {
  readonly item: Item
  readonly score: number
}

/**
 * How close to the best a choice must be to be considered, as a fraction of
 * the best score. A tenth: near-ties vary, clear winners do not.
 */
export const NEARLY_AS_GOOD = 0.1

/**
 * Pick at random from among the choices that are NEARLY AS GOOD as the best.
 *
 * A player that always takes the single highest-scoring move plays the same
 * game every time. Same board, same moves, every match. That is dull to
 * play against and easy to learn, which is a worse fault than losing a few
 * more games.
 *
 * But varying between the top few regardless of score is worse: it throws
 * away a clearly better move as readily as it swaps two equal ones. So the
 * shortlist is by SCORE GAP, not by rank. Moves within a tenth of the best
 * are treated as a tie and chosen between. A move that is plainly better is
 * always taken.
 */
export function pickAmongBest<Item>(
  random: RandomSource,
  choices: ReadonlyArray<Scored<Item>>,
  nearly: number = NEARLY_AS_GOOD,
): Item | undefined {
  if (choices.length === 0) {
    return undefined
  }

  const best = Math.max(...choices.map((each) => each.score))
  const margin = Math.max(1, Math.abs(best) * nearly)
  const shortlist = choices.filter((each) => each.score >= best - margin)

  return shortlist[random.nextInt(shortlist.length)]?.item
}

/**
 * How a computer player spreads its new armies over its front before its
 * own plan places the rest. Plan tasks 4.16 and 4.17.
 *
 * Nick, watching a late one-on-one game: "When a CP gets hundreds of new
 * armies they shouldn't just dump in one place to begin a blitzkrieg...
 * they should be boosting their already conquered territories a little
 * as well." Then, of ordinary turns: "make them all split ordinary turns
 * too."
 */
export const SPREADING = {
  /** A turn that hands out more armies than this is a BIG turn. */
  bigTurn: 20,
  /** The share of a big turn that goes to the front first, spread thin. */
  bigShare: 0.3,
  /** The share of an ordinary turn that goes to the front first. */
  ordinaryShare: 0.2,
  /** Does the General spread ordinary turns too, or only big ones? */
  generalEveryTurn: true,
}

/**
 * The first placements of a turn spread a share of its armies over the
 * front, thinnest territory first. Returns null once that share is down,
 * and the player's own choice takes over.
 *
 * Only the front: armies buried inland can never fight, which was the very
 * first fault Nick named. And it needs no memory, because the armies
 * already down are what the turn gave minus what is left to place.
 */
export function spreadFirst(
  state: GameState,
  playerId: PlayerId,
  allowed: readonly TerritoryId[],
  bigTurnsOnly = false,
): GameAction | null {
  if (state.turn.phase !== 'reinforce') {
    return null
  }

  const given = state.turn.armiesGiven ?? state.turn.armiesToPlace
  const big = given > SPREADING.bigTurn

  if (!big && bigTurnsOnly) {
    return null
  }

  const share = Math.floor(given * (big ? SPREADING.bigShare : SPREADING.ordinaryShare))
  const alreadyDown = given - state.turn.armiesToPlace
  const front = allowed.filter((id) => isFrontier(state, playerId, id))

  if (alreadyDown >= share || front.length < 2) {
    return null
  }

  const thinnest = [...front].sort(
    (one, two) => armiesOn(state, one) - armiesOn(state, two) || one.localeCompare(two),
  )[0] as TerritoryId

  return {
    type: 'placeArmies',
    territoryId: thinnest,
    count: Math.min(
      Math.max(1, Math.floor(share / front.length)),
      share - alreadyDown,
      state.turn.armiesToPlace,
    ),
  }
}
