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
  return armiesAtTurnStart(map, board, playerId).given
}

/** What a player is given when their turn begins, and where it came from. */
export interface TurnStartArmies {
  /** The whole number handed over. */
  readonly given: number
  /** How many territories the player held. */
  readonly territoriesHeld: number
  /** The part that comes from the land held, the minimum included. */
  readonly forLand: number
  /** Every region held whole, each of which added its bonus. */
  readonly regionsHeld: readonly RegionId[]
}

/**
 * The armies a turn begins with, taken apart. Plan task 4.56.
 *
 * Nick asked whether region bonuses were being paid at the start of a
 * turn. They were, and a test now plays whole games to prove it. But the
 * screen only ever said "7 armies left to place", so a player who had just
 * taken a whole region saw the number go up with no reason given. This is
 * the reason, recorded when the turn begins so the screen can show it.
 *
 * Recorded then rather than worked out again later on purpose. With
 * `cardTrading: 'anyTime'` a set can be traded after the board has changed
 * hands, and the land held by then is not the land that paid.
 */
export function armiesAtTurnStart(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
): TurnStartArmies {
  const owned = territoriesOwnedBy(board, playerId).length

  const forLand = Math.max(
    MINIMUM_REINFORCEMENTS,
    Math.floor(owned / TERRITORIES_PER_ARMY),
  )

  const held = map.regions.filter((region) =>
    ownsWholeRegion(map, board, playerId, region.id),
  )

  return {
    given: forLand + held.reduce((total, region) => total + region.bonus, 0),
    territoriesHeld: owned,
    forLand,
    regionsHeld: held.map((region) => region.id),
  }
}

/** One line of "where did these armies come from". */
export interface ArmySource {
  readonly label: string
  readonly armies: number
}

/**
 * Where the armies a player has been given this turn came from, in order:
 * land, then each region held, then any sets traded. Plan task 4.56.
 *
 * Answers nothing for a game from before the turn recorded it, rather than
 * guessing from a board that may have changed since.
 */
export function whereArmiesCameFrom(
  map: GameMap,
  turn: {
    readonly armiesGiven?: number
    readonly armiesToPlace: number
    readonly armiesForLand?: number
    readonly territoriesHeld?: number
    readonly regionsHeld?: readonly RegionId[]
  },
): readonly ArmySource[] {
  if (turn.armiesForLand === undefined || turn.regionsHeld === undefined) {
    return []
  }

  const land = turn.territoriesHeld
  const sources: ArmySource[] = [
    {
      label: land === undefined ? 'Your land' : `${land} territories`,
      armies: turn.armiesForLand,
    },
  ]

  let fromRegions = 0

  for (const id of turn.regionsHeld) {
    const region = map.regions.find((each) => each.id === id)

    if (region === undefined) continue

    sources.push({ label: region.name, armies: region.bonus })
    fromRegions += region.bonus
  }

  const given = turn.armiesGiven ?? turn.armiesToPlace
  const fromCards = given - turn.armiesForLand - fromRegions

  if (fromCards > 0) {
    sources.push({ label: 'Cards', armies: fromCards })
  }

  return sources
}
