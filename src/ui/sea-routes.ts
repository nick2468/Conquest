import type { GameMap } from '../engine'
import { cornersOf, isWithin, touchingLength } from '../maps/shapes'

type Point = readonly [number, number]

/**
 * The sea crossings of a map, as one SVG path of faint dashed lines.
 * Plan task 4.20.
 *
 * Nick, after watching a computer player move armies from Brazil to China:
 * "The player must have transited by EAF straight to the middle east, I
 * didn't realise there is a sea route there. We need to think of a way to
 * show sea routes." The border list is the truth (spec S4), and 25 of the
 * world's borders cross water. Nothing on the board showed them.
 *
 * So every border between two places whose shapes do not touch is drawn,
 * the way the printed board draws them: a dashed line across the water,
 * between the nearest points of the two coasts.
 *
 * A crossing whose two ends are more than half the map apart goes round
 * the back of the world, as Alaska to Kamchatka does. A line straight
 * across the map would be wrong, so each end gets a short line off its own
 * edge of the map instead, which is how the printed board shows it too.
 */
export function seaRoutesOf(map: GameMap): string {
  const [left = 0, , width = 0] = map.viewBox.trim().split(/\s+/).map(Number)
  const right = left + width
  const shapes = new Map(map.territories.map((each) => [each.id, cornersOf(each.shape)]))
  const hostOf = new Map(map.territories.map((each) => [each.id, each.drawnOver ?? each.id]))
  const lines: string[] = []

  /**
   * True if two places meet on land.
   *
   * A city is drawn on top of its state, inside it, so its own outline
   * never shares an edge with anything. The first version took every
   * border of Sydney for a sea crossing and drew 33 dashes on the detailed
   * Australia map. So a city is judged by the state it is drawn on.
   *
   * And "sharing an edge" was the wrong test for land. On a hand-drawn map
   * two neighbours often meet at a single corner, or leave a hairline gap,
   * so 25 land borders still looked like water. What makes a crossing is
   * WATER between the two coasts: a gap wider than SEA_GAP.
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

  /** True if the line between two points passes over some OTHER place. */
  const crossesLand = (from: Point, to: Point, one: string, two: string): boolean => {
    const ends = new Set([one, two, hostOf.get(one) ?? one, hostOf.get(two) ?? two])

    for (let step = 1; step < 10; step += 1) {
      const along = step / 10
      const point: Point = [from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along]

      for (const [id, corners] of shapes) {
        if (!ends.has(id) && isWithin(point, corners)) {
          return true
        }
      }
    }

    return false
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

      const nearest = nearestPoints(mine, theirs)
      const goesRound = Math.abs(nearest[0][0] - nearest[1][0]) > width / 2

      // A dash is only for WATER. The nearest two corners sometimes give a
      // line that clips a third place on the way, so the next nearest pairs
      // are tried in turn, and the first that stays over the sea is used.
      // Some maps declare a border between two places with no water
      // between them at all, such as Gascoyne and the Nullarbor on the
      // detailed Australia map. No pair will do for those, and they get no
      // dash, because a dash across land would read as a crossing.
      const found = goesRound
        ? nearest
        : closePairs(mine, theirs).find(
            ([from, to]) => !crossesLand(from, to, territory.id, otherId),
          )

      if (found === undefined) {
        continue
      }

      const [one, two] = found

      if (goesRound) {
        const [west, east] = one[0] < two[0] ? [one, two] : [two, one]

        lines.push(`M ${west[0]} ${west[1]} L ${left} ${west[1]}`)
        lines.push(`M ${east[0]} ${east[1]} L ${right} ${east[1]}`)
      } else {
        lines.push(`M ${one[0]} ${one[1]} L ${two[0]} ${two[1]}`)
      }
    }
  }

  return lines.join(' ')
}

/**
 * How wide a gap between two outlines must be to count as water, in map
 * units. Land neighbours on a hand-drawn map can miss each other by a
 * hairline; a real strait is wider than this on every map we ship.
 */
const SEA_GAP = 2

/** The narrowest gap between two outlines: every corner against every edge. */
function gapBetween(one: readonly Point[], two: readonly Point[]): number {
  let narrowest = Infinity

  for (const [from, to] of [[one, two], [two, one]] as const) {
    for (const corner of from) {
      for (let at = 0; at < to.length; at += 1) {
        const start = to[at] as Point
        const end = to[(at + 1) % to.length] as Point

        narrowest = Math.min(narrowest, distanceToEdge(corner, start, end))
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

/** How many of the closest corner pairs to try before giving up. */
const PAIRS_TO_TRY = 60

/** Pairs of corners, one on each coast, closest first. */
function closePairs(one: readonly Point[], two: readonly Point[]): Array<[Point, Point]> {
  const pairs: Array<[number, Point, Point]> = []

  for (const here of one) {
    for (const there of two) {
      pairs.push([(here[0] - there[0]) ** 2 + (here[1] - there[1]) ** 2, here, there])
    }
  }

  return pairs
    .sort((a, b) => a[0] - b[0])
    .slice(0, PAIRS_TO_TRY)
    .map(([, here, there]) => [here, there])
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
