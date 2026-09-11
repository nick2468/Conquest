import type { GameMap } from '../engine'
import { cornersOf, isWithin, touchingLength } from '../maps/shapes'

type Point = readonly [number, number]

/**
 * The sea crossings of a map, as one SVG path of dashed lines.
 * Plan tasks 4.20 and 4.22.
 *
 * Nick, after watching a computer player move armies from Brazil to China:
 * "I didn't realise there is a sea route there. We need to think of a way
 * to show sea routes." The border list is the truth (spec S4), and many
 * borders cross water. Nothing on the board showed them.
 *
 * So every border with water between the two coasts is drawn, the way the
 * printed board draws them: a dashed line from one coast to the other.
 *
 * WHERE the line goes matters as much as that it is there. Nick, of the
 * first version: "Greenland looks like it is going twice to NWT and not to
 * Ontario", "EAF to Middle East bit hard to see", and "don't always use the
 * smallest gap, use a clearer one if it can be determined." So each end
 * sits on open coast, well clear of any third place, and a crossing long
 * enough to see is chosen over the narrowest one. See `clearestLine`.
 *
 * A crossing whose two ends are more than half the map apart goes round
 * the back of the world, as Alaska to Kamchatka does. Each end then gets a
 * short line off its own edge of the map, from its OUTER coast. Nick: "Alaska
 * seems to be drawing to the inland junction of YAK, IRK and Kamchatka."
 */
export function seaRoutesOf(map: GameMap): string {
  return seaRouteLines(map)
    .map(({ from, to }) => `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`)
    .join(' ')
}

/** One dash on the board. `places` names the two ends of the crossing. */
export interface SeaRouteLine {
  readonly from: Point
  readonly to: Point
  readonly places: readonly [string, string]
}

const WORKED_OUT = new Map<GameMap, SeaRouteLine[]>()

/** Every dash of a map. Worked out once per map; it takes a moment. */
export function seaRouteLines(map: GameMap): SeaRouteLine[] {
  const known = WORKED_OUT.get(map)

  if (known !== undefined) {
    return known
  }

  const lines = workOut(map)

  WORKED_OUT.set(map, lines)
  return lines
}

/**
 * How wide a gap between two outlines must be to count as water, in map
 * units. Land neighbours on a hand-drawn map can miss each other by a
 * hairline; a real strait is wider than this on every map we ship.
 */
const SEA_GAP = 2

/** How far an end of a dash must be from any third place, in map units. */
const CLEAR_OF_OTHERS = 6

/** A dash shorter than this is hard to see, so a longer one is preferred. */
const LONG_ENOUGH_TO_SEE = 16

function workOut(map: GameMap): SeaRouteLine[] {
  const [left = 0, , width = 0] = map.viewBox.trim().split(/\s+/).map(Number)
  const right = left + width
  const shapes = new Map(map.territories.map((each) => [each.id, cornersOf(each.shape)]))
  const hostOf = new Map(map.territories.map((each) => [each.id, each.drawnOver ?? each.id]))
  const lines: SeaRouteLine[] = []

  /**
   * True if two places meet on land.
   *
   * A city is drawn on top of its state, inside it, so its own outline
   * never shares an edge with anything. So a city is judged by the state it
   * is drawn on. And on a hand-drawn map two neighbours often meet at a
   * single corner or leave a hairline gap, so what makes a crossing is WATER
   * between the coasts: a gap wider than SEA_GAP.
   */
  const meetOnLand = (one: string, two: string): boolean => {
    const hostOne = hostOf.get(one) ?? one
    const hostTwo = hostOf.get(two) ?? two
    const shapeOne = shapes.get(hostOne) ?? []
    const shapeTwo = shapes.get(hostTwo) ?? []

    return (
      hostOne === hostTwo ||
      touchingLength(shapeOne, shapeTwo) > 0 ||
      gapBetween(shapeOne, shapeTwo) <= SEA_GAP
    )
  }

  /** The places that are neither end of a crossing. */
  const othersThan = (one: string, two: string): Array<readonly Point[]> => {
    const ends = new Set([one, two, hostOf.get(one) ?? one, hostOf.get(two) ?? two])

    return [...shapes].filter(([id]) => !ends.has(id)).map(([, corners]) => corners)
  }

  for (const territory of map.territories) {
    const mine = shapes.get(territory.id) ?? []

    for (const otherId of territory.borders) {
      // Each crossing once, not once from each end.
      if (otherId <= territory.id) continue

      const theirs = shapes.get(otherId) ?? []

      if (mine.length === 0 || theirs.length === 0 || meetOnLand(territory.id, otherId)) {
        continue
      }

      const others = othersThan(territory.id, otherId)
      const places: readonly [string, string] = [territory.id, otherId]
      const nearest = nearestPoints(mine, theirs)

      if (Math.abs(nearest[0][0] - nearest[1][0]) > width / 2) {
        // Round the back of the world: from each place's OUTER coast.
        const westFirst = centreX(mine) < centreX(theirs)
        const [west, east] = westFirst ? [mine, theirs] : [theirs, mine]
        const westEnd = outermost(west, others, 'west')
        const eastEnd = outermost(east, others, 'east')

        lines.push({ from: westEnd, to: [left, westEnd[1]], places })
        lines.push({ from: eastEnd, to: [right, eastEnd[1]], places })
        continue
      }

      const line = clearestLine(mine, theirs, others)

      if (line !== null) {
        lines.push({ from: line[0], to: line[1], places })
      }
    }
  }

  return lines
}

/**
 * The best dash between two coasts, or null if there is no water route.
 *
 * Every pair of corners is a candidate. A candidate must stay over water
 * all the way. The best is the one whose ends are both on open coast, at
 * least CLEAR_OF_OTHERS from any third place, so no end sits at a junction
 * and seems to belong to a neighbour; among those, the shortest that is at
 * least LONG_ENOUGH_TO_SEE, or failing that the longest that is shorter.
 *
 * If no candidate has clear ends, the shortest line over water is used, so
 * a crossing is never left undrawn just because its coast is crowded. Only
 * a border with no water between the places at all, such as Gascoyne and
 * the Nullarbor on the detailed Australia map, gets no dash.
 */
function clearestLine(
  one: readonly Point[],
  two: readonly Point[],
  others: ReadonlyArray<readonly Point[]>,
): [Point, Point] | null {
  const clearOne = one.filter((corner) => clearance(corner, others) >= CLEAR_OF_OTHERS)
  const clearTwo = two.filter((corner) => clearance(corner, others) >= CLEAR_OF_OTHERS)
  const byPreference = (pairs: Array<[number, Point, Point]>) =>
    pairs.sort((a, b) => {
      const aSeen = a[0] >= LONG_ENOUGH_TO_SEE ** 2
      const bSeen = b[0] >= LONG_ENOUGH_TO_SEE ** 2

      if (aSeen !== bSeen) return aSeen ? -1 : 1

      // Long enough: the shortest of those. Too short: the longest.
      return aSeen ? a[0] - b[0] : b[0] - a[0]
    })

  for (const pair of byPreference(pairsOf(clearOne, clearTwo))) {
    if (!crossesLand(pair[1], pair[2], others)) {
      return [pair[1], pair[2]]
    }
  }

  const nearestFirst = pairsOf(one, two).sort((a, b) => a[0] - b[0])

  for (const pair of nearestFirst.slice(0, 200)) {
    if (!crossesLand(pair[1], pair[2], others)) {
      return [pair[1], pair[2]]
    }
  }

  return null
}

/** Every pair of corners, one from each list, with the squared distance. */
function pairsOf(one: readonly Point[], two: readonly Point[]): Array<[number, Point, Point]> {
  const pairs: Array<[number, Point, Point]> = []

  for (const here of one) {
    for (const there of two) {
      pairs.push([(here[0] - there[0]) ** 2 + (here[1] - there[1]) ** 2, here, there])
    }
  }

  return pairs
}

/** The corner furthest out on one side, preferring open coast. */
function outermost(
  corners: readonly Point[],
  others: ReadonlyArray<readonly Point[]>,
  side: 'west' | 'east',
): Point {
  const clear = corners.filter((corner) => clearance(corner, others) >= CLEAR_OF_OTHERS)
  const pool = clear.length > 0 ? clear : corners

  return pool.reduce((best, corner) =>
    side === 'west' ? (corner[0] < best[0] ? corner : best) : corner[0] > best[0] ? corner : best,
  )
}

function centreX(corners: readonly Point[]): number {
  return corners.reduce((total, [x]) => total + x, 0) / corners.length
}

/** How far a point is from the nearest of some other outlines. */
function clearance(point: Point, others: ReadonlyArray<readonly Point[]>): number {
  let nearest = Infinity

  for (const outline of others) {
    for (let at = 0; at < outline.length; at += 1) {
      nearest = Math.min(
        nearest,
        distanceToEdge(point, outline[at] as Point, outline[(at + 1) % outline.length] as Point),
      )
    }
  }

  return nearest
}

/** True if the line between two points passes over some other place. */
function crossesLand(from: Point, to: Point, others: ReadonlyArray<readonly Point[]>): boolean {
  for (let step = 1; step < 10; step += 1) {
    const along = step / 10
    const point: Point = [from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along]

    if (others.some((outline) => isWithin(point, outline))) {
      return true
    }
  }

  return false
}

/** The narrowest gap between two outlines: every corner against every edge. */
function gapBetween(one: readonly Point[], two: readonly Point[]): number {
  let narrowest = Infinity

  for (const [from, to] of [[one, two], [two, one]] as const) {
    for (const corner of from) {
      for (let at = 0; at < to.length; at += 1) {
        narrowest = Math.min(
          narrowest,
          distanceToEdge(corner, to[at] as Point, to[(at + 1) % to.length] as Point),
        )
      }
    }
  }

  return narrowest
}

function distanceToEdge(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = dx * dx + dy * dy
  const along =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length))

  return Math.hypot(point[0] - (start[0] + along * dx), point[1] - (start[1] + along * dy))
}

/** The two corners, one on each coast, that are closest together. */
function nearestPoints(one: readonly Point[], two: readonly Point[]): [Point, Point] {
  let best: [Point, Point] = [one[0] as Point, two[0] as Point]
  let closest = Infinity

  for (const here of one) {
    for (const there of two) {
      const apart = (here[0] - there[0]) ** 2 + (here[1] - there[1]) ** 2

      if (apart < closest) {
        closest = apart
        best = [here, there]
      }
    }
  }

  return best
}
