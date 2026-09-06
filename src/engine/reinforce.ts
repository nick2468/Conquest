/**
 * How many armies a player gets at the start of a turn. See spec 6.1.
 *
 *   armies = max(3, territories owned / 3, rounded down)
 *          + the bonus for each region the player owns completely
 */
import { MINIMUM_REINFORCEMENTS, TERRITORIES_PER_ARMY } from './balance'
import type { Board, GameMap, PlayerId, RegionId, TerritoryId } from './types'

export function territoriesOwnedBy(
  board: Board,
  playerId: PlayerId,
): TerritoryId[] {
  return Object.keys(board).filter(
    (territoryId) => board[territoryId]?.ownerId === playerId,
  )
}

/** True if this player owns every territory in the region. */
export function ownsWholeRegion(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
  regionId: RegionId,
): boolean {
  const inRegion = map.territories.filter(
    (territory) => territory.regionId === regionId,
  )

  if (inRegion.length === 0) {
    return false
  }

  return inRegion.every(
    (territory) => board[territory.id]?.ownerId === playerId,
  )
}

/** The bonus armies this player earns from regions they hold completely. */
export function regionBonusFor(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
): number {
  return map.regions
    .filter((region) => ownsWholeRegion(map, board, playerId, region.id))
    .reduce((total, region) => total + region.bonus, 0)
}

/**
 * The armies this player places at the start of their turn.
 *
 * The minimum of three matters more than it looks. Without it a player down
 * to two territories gets nothing and can never come back.
 */
export function reinforcementsFor(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
): number {
  const owned = territoriesOwnedBy(board, playerId).length

  const fromTerritories = Math.max(
    MINIMUM_REINFORCEMENTS,
    Math.floor(owned / TERRITORIES_PER_ARMY),
  )

  return fromTerritories + regionBonusFor(map, board, playerId)
}
