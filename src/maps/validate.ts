/**
 * The ten checks a map must pass. See spec 3.2.
 *
 * Two of these earn their place on their own. The symmetry check catches the
 * most common mistake by far, which is typing a border on one side and
 * forgetting the other. The connected check stops a map where part of the
 * board can never be reached, which would make the game unwinnable.
 *
 * Phase 5 loads maps other people wrote, so every message here is written to
 * be read by the person who made the mistake.
 */
import type { GameMap, TerritoryDefinition, TerritoryId } from '../engine'
import type { Corner } from './shapes'
import { cornersOf, isWithin, overlapBetween, roomTakenBy } from './shapes'

export interface MapProblem {
  /** A short name for the rule that was broken. */
  readonly rule: string
  /** What is wrong, in plain words. */
  readonly message: string
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()

  for (const value of values) {
    if (seen.has(value)) {
      twice.add(value)
    }
    seen.add(value)
  }

  return [...twice].sort()
}

/**
 * Check a map. An empty list means the map is good.
 */
export function validateMap(map: GameMap): MapProblem[] {
  const problems: MapProblem[] = []

  const territoryIds = map.territories.map((territory) => territory.id)
  const regionIds = map.regions.map((region) => region.id)
  const knownTerritories = new Set(territoryIds)
  const knownRegions = new Set(regionIds)

  // 1. Every territory id appears once.
  for (const duplicate of findDuplicates(territoryIds)) {
    problems.push({
      rule: 'unique territory ids',
      message: `Two territories share the id "${duplicate}".`,
    })
  }

  // 2. Every region id appears once.
  for (const duplicate of findDuplicates(regionIds)) {
    problems.push({
      rule: 'unique region ids',
      message: `Two regions share the id "${duplicate}".`,
    })
  }

  for (const territory of map.territories) {
    // 3. Every territory names a region that exists.
    if (!knownRegions.has(territory.regionId)) {
      problems.push({
        rule: 'region exists',
        message:
          `Territory "${territory.id}" is in region ` +
          `"${territory.regionId}", but there is no such region.`,
      })
    }

    for (const border of territory.borders) {
      // 4. Every border names a territory that exists.
      if (!knownTerritories.has(border)) {
        problems.push({
          rule: 'border exists',
          message:
            `Territory "${territory.id}" borders "${border}", ` +
            `but there is no such territory.`,
        })
        continue
      }

      // 5. No territory borders itself.
      if (border === territory.id) {
        problems.push({
          rule: 'no self border',
          message: `Territory "${territory.id}" borders itself.`,
        })
        continue
      }

      // 6. Borders are symmetric.
      const other = map.territories.find((each) => each.id === border)

      if (other !== undefined && !other.borders.includes(territory.id)) {
        problems.push({
          rule: 'borders are symmetric',
          message:
            `"${territory.id}" borders "${border}", but "${border}" does ` +
            `not border "${territory.id}". Add it to both.`,
        })
      }
    }
  }

  // 7. Every region holds at least one territory.
  for (const region of map.regions) {
    const holds = map.territories.some(
      (territory) => territory.regionId === region.id,
    )

    if (!holds) {
      problems.push({
        rule: 'region has territories',
        message: `Region "${region.id}" holds no territories.`,
      })
    }
  }

  // 8. The map is connected.
  problems.push(...checkConnected(map))

  // 9. No two places claim the same ground.
  problems.push(...checkNoOverlap(map))

  // 10. No army count sits on somebody else's place.
  problems.push(...checkCountsAreClear(map))

  return problems
}

/** The drawn corners of every place, worked out once. */
function shapesIn(map: GameMap): Map<TerritoryId, Corner[]> {
  return new Map(
    map.territories.map((territory) => [
      territory.id,
      cornersOf(territory.shape),
    ]),
  )
}

function nameOf(territory: TerritoryDefinition): string {
  return `"${territory.name}"`
}

/** A place on the map, written for a person rather than for arithmetic. */
function round(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}

/**
 * Check 9. No two places claim the same ground. Plan task 2.2.8.
 *
 * This is the fault that got through on the small map. Queensland and South
 * Australia both owned the same rectangle and it sat there for days,
 * because the only thing that was ever going to catch it was a person
 * noticing.
 *
 * One overlap is allowed, and only one: a city drawn on top of the place
 * around it. A map has to SAY so, with `drawnOver`, and then this checks
 * that what it says is true.
 */
function checkNoOverlap(map: GameMap): MapProblem[] {
  const problems: MapProblem[] = []
  const shapes = shapesIn(map)
  const known = new Set(map.territories.map((each) => each.id))

  for (const territory of map.territories) {
    const over = territory.drawnOver

    if (over === undefined) {
      continue
    }

    if (over === territory.id) {
      problems.push({
        rule: 'drawn over',
        message: `${nameOf(territory)} says it is drawn over itself.`,
      })
      continue
    }

    if (!known.has(over)) {
      problems.push({
        rule: 'drawn over',
        message:
          `${nameOf(territory)} says it is drawn over "${over}", ` +
          `but there is no such territory.`,
      })
      continue
    }

    const under = map.territories.find((each) => each.id === over)

    if (under === undefined) {
      continue
    }

    if (!territory.borders.includes(over)) {
      problems.push({
        rule: 'drawn over',
        message:
          `${nameOf(territory)} is drawn over ${nameOf(under)}, so it sits ` +
          `inside it, but the two do not border each other.`,
      })
    }

    if (
      roomTakenBy(shapes.get(territory.id) ?? []) >=
      roomTakenBy(shapes.get(over) ?? [])
    ) {
      problems.push({
        rule: 'drawn over',
        message:
          `${nameOf(territory)} is drawn over ${nameOf(under)}, but it is ` +
          `not the smaller of the two. That is the wrong way round.`,
      })
    }

    if (
      overlapBetween(
        shapes.get(territory.id) ?? [],
        shapes.get(over) ?? [],
      ) === null
    ) {
      problems.push({
        rule: 'drawn over',
        message:
          `${nameOf(territory)} says it is drawn over ${nameOf(under)}, ` +
          `but the two shapes do not touch. Has one of them been moved?`,
      })
    }
  }

  for (let first = 0; first < map.territories.length; first += 1) {
    for (let second = first + 1; second < map.territories.length; second += 1) {
      const one = map.territories[first] as TerritoryDefinition
      const two = map.territories[second] as TerritoryDefinition

      if (one.drawnOver === two.id || two.drawnOver === one.id) {
        continue
      }

      const where = overlapBetween(
        shapes.get(one.id) ?? [],
        shapes.get(two.id) ?? [],
      )

      if (where !== null) {
        problems.push({
          rule: 'no two places overlap',
          message:
            `${nameOf(one)} and ${nameOf(two)} both cover the point ` +
            `${round(where[0])}, ${round(where[1])}. Two places may only ` +
            `share a border, ` +
            `never any ground. If one is a city drawn on the other, say so ` +
            `with drawnOver.`,
        })
      }
    }
  }

  return problems
}

/**
 * Check 10. No army count sits on somebody else's place. Plan task 2.1.5.
 *
 * A count may sit on its own land. It may sit on nothing at all, out in the
 * sea, which is what Rottnest and the Whitsundays do because they are too
 * small to hold a number. It may sit on the place a city is drawn over,
 * which is where Perth's count sits.
 *
 * Anywhere else and the number appears to belong to the wrong place, which
 * is worse than no number at all.
 */
function checkCountsAreClear(map: GameMap): MapProblem[] {
  const problems: MapProblem[] = []
  const shapes = shapesIn(map)

  for (const territory of map.territories) {
    const at: Corner = [territory.labelAt.x, territory.labelAt.y]

    for (const other of map.territories) {
      if (other.id === territory.id || other.id === territory.drawnOver) {
        continue
      }

      if (isWithin(at, shapes.get(other.id) ?? [])) {
        problems.push({
          rule: 'counts are clear',
          message:
            `The army count for ${nameOf(territory)} is drawn at ` +
            `${at[0]}, ${at[1]}, which is inside ${nameOf(other)}. It will ` +
            `look like ${nameOf(other)}'s count. Move it onto its own land ` +
            `or out past the coast.`,
        })
      }
    }
  }

  return problems
}

/**
 * Walk the map from the first territory and see whether every other
 * territory can be reached.
 *
 * The walk checks everything one step away, then everything two steps away,
 * and so on. That is called a breadth-first search. The same walk is used
 * again for the connected fortify move in spec 6.5.
 */
function checkConnected(map: GameMap): MapProblem[] {
  if (map.territories.length === 0) {
    return [{ rule: 'map is connected', message: 'The map has no territories.' }]
  }

  const start = map.territories[0] as { id: TerritoryId }
  const reached = new Set<TerritoryId>([start.id])
  const toVisit: TerritoryId[] = [start.id]

  while (toVisit.length > 0) {
    const current = toVisit.shift() as TerritoryId
    const territory = map.territories.find((each) => each.id === current)

    for (const border of territory?.borders ?? []) {
      if (!reached.has(border)) {
        reached.add(border)
        toVisit.push(border)
      }
    }
  }

  const stranded = map.territories
    .map((territory) => territory.id)
    .filter((id) => !reached.has(id))

  if (stranded.length === 0) {
    return []
  }

  return [
    {
      rule: 'map is connected',
      message:
        `These territories cannot be reached from "${start.id}": ` +
        `${stranded.join(', ')}. Every territory must be reachable, or the ` +
        `game cannot be won.`,
    },
  ]
}

/**
 * Check a map and throw if it is bad. Use this on a map we ship, where a
 * fault is a bug rather than something a player did.
 */
export function assertValidMap(map: GameMap): void {
  const problems = validateMap(map)

  if (problems.length > 0) {
    const lines = problems.map(
      (problem) => `  - [${problem.rule}] ${problem.message}`,
    )

    throw new Error(
      `The map "${map.id}" has ${problems.length} problem(s):\n` +
        lines.join('\n'),
    )
  }
}
