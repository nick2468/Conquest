import type { RandomSource } from '../random'
import type {
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
