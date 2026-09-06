/**
 * The one army move a player may make at the end of a turn. See spec 6.5.
 *
 * Two rules, and which one applies is a setting. See D10.
 *
 *   'adjacent'   the two territories must share a border
 *   'connected'  a path must exist where the player owns every territory
 *                on the way
 *
 * At least one army must always stay behind.
 */
import { ARMIES_LEFT_BEHIND } from './attack'
import type {
  Board,
  GameMap,
  GameOptions,
  PlayerId,
  TerritoryId,
} from './types'

export type FortifyDistance = GameOptions['fortifyDistance']

/** The most armies that may leave a territory. */
export function armiesAvailableToMove(
  board: Board,
  fromId: TerritoryId,
): number {
  const armies = board[fromId]?.armies ?? 0

  return Math.max(0, armies - ARMIES_LEFT_BEHIND)
}

function bordersOf(map: GameMap, territoryId: TerritoryId): readonly string[] {
  return (
    map.territories.find((territory) => territory.id === territoryId)
      ?.borders ?? []
  )
}

function isOwnedBy(
  board: Board,
  territoryId: TerritoryId,
  playerId: PlayerId,
): boolean {
  return board[territoryId]?.ownerId === playerId
}

/**
 * Every territory a player could move armies to from here.
 *
 * The 'connected' walk checks everything one step away, then everything two
 * steps away, and so on, never leaving the player's own territories. That is
 * called a breadth-first search. The same walk checks that a whole map is
 * reachable, in the map checks.
 *
 * The territory you start from is never in the answer. Moving armies to
 * where they already are is not a move.
 */
export function fortifyTargets(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
  fromId: TerritoryId,
  distance: FortifyDistance,
): TerritoryId[] {
  if (!isOwnedBy(board, fromId, playerId)) {
    return []
  }

  if (distance === 'adjacent') {
    return bordersOf(map, fromId).filter((border) =>
      isOwnedBy(board, border, playerId),
    )
  }

  const reached = new Set<TerritoryId>([fromId])
  const toVisit: TerritoryId[] = [fromId]

  while (toVisit.length > 0) {
    const current = toVisit.shift() as TerritoryId

    for (const border of bordersOf(map, current)) {
      if (!reached.has(border) && isOwnedBy(board, border, playerId)) {
        reached.add(border)
        toVisit.push(border)
      }
    }
  }

  reached.delete(fromId)

  return [...reached]
}

/** Why a fortify move is not allowed, or null if it is. */
export function fortifyProblem(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
  fromId: TerritoryId,
  toId: TerritoryId,
  count: number,
  distance: FortifyDistance,
): string | null {
  if (!isOwnedBy(board, fromId, playerId)) {
    return `You do not own "${fromId}".`
  }

  if (!isOwnedBy(board, toId, playerId)) {
    return `You do not own "${toId}".`
  }

  if (fromId === toId) {
    return 'The armies are already there.'
  }

  if (!Number.isInteger(count) || count < 1) {
    return `You must move at least one army, not ${count}.`
  }

  const available = armiesAvailableToMove(board, fromId)

  if (count > available) {
    return (
      `You can move at most ${available} armies out of "${fromId}", ` +
      `because one must stay behind.`
    )
  }

  if (!fortifyTargets(map, board, playerId, fromId, distance).includes(toId)) {
    return distance === 'adjacent'
      ? `"${fromId}" does not border "${toId}".`
      : `There is no path from "${fromId}" to "${toId}" through your own ` +
          `territories.`
  }

  return null
}

export function canFortify(
  map: GameMap,
  board: Board,
  playerId: PlayerId,
  fromId: TerritoryId,
  toId: TerritoryId,
  count: number,
  distance: FortifyDistance,
): boolean {
  return (
    fortifyProblem(map, board, playerId, fromId, toId, count, distance) === null
  )
}
