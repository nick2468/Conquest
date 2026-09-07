/**
 * The arithmetic of the drawn shapes. Plan tasks 2.1.5 and 2.2.8.
 *
 * Both of those guards sat unwritten for a day on one belief: that working
 * out whether shapes overlap needs a browser, because `isPointInFill` is a
 * browser thing. That was giving up too early. Whether a point is inside a
 * shape is arithmetic, and so is whether two edges cross.
 *
 * It matters because the one map fault that ever reached the screen was of
 * exactly this kind. Queensland and South Australia both claimed the same
 * rectangle, and it sat there for days, because the only thing that was
 * ever going to catch it was somebody looking at it.
 *
 * Nothing here touches a browser, so it runs on the ordinary test bar.
 */

/** One point of a drawn shape. */
export type Corner = readonly [number, number]

/**
 * The corners of a shape, read back out of its SVG path.
 *
 * Every shape we draw is a straight-sided outline written as "M x y L x y
 * ... Z", so pulling the numbers out in pairs is enough. A curve would need
 * more, and spec S4 is why we do not have any: the border list is the
 * truth, and the shape is only a picture.
 */
export function cornersOf(shape: string): Corner[] {
  const numbers = (shape.match(/[\d.]+/g) ?? []).map(Number)
  const corners: Corner[] = []

  for (let at = 0; at + 1 < numbers.length; at += 2) {
    corners.push([numbers[at] as number, numbers[at + 1] as number])
  }

  return corners
}

/** Each side of a shape, joined back to the start. */
function edgesOf(corners: readonly Corner[]): Array<[Corner, Corner]> {
  return corners.map((corner, at) => [
    corner,
    corners[(at + 1) % corners.length] as Corner,
  ])
}

/**
 * How close counts as touching, in map units.
 *
 * The shapes are built from a shared table of whole numbers, so two places
 * that share a border share the exact same points. This only has to allow
 * for the arithmetic, not for sloppy drawing.
 */
const TOUCHING = 0.001

/** How far a point is from a line between two others. */
function distanceToEdge(point: Corner, from: Corner, to: Corner): number {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const length = Math.hypot(alongX, alongY)

  if (length === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1])
  }

  // How far along the edge the nearest point is, kept between the two ends.
  const howFar = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) /
        (length * length),
    ),
  )

  return Math.hypot(
    point[0] - (from[0] + howFar * alongX),
    point[1] - (from[1] + howFar * alongY),
  )
}

/** Is this point sitting on the outline itself? */
export function isOnEdge(point: Corner, corners: readonly Corner[]): boolean {
  return edgesOf(corners).some(
    ([from, to]) => distanceToEdge(point, from, to) <= TOUCHING,
  )
}

/**
 * Is this point inside the shape?
 *
 * Counts how many times a line drawn out to the right from the point
 * crosses the outline. An odd count means inside. That is the whole trick,
 * and it works for any shape, however awkward.
 *
 * A point exactly ON the outline may come out either way. Use `isWithin`
 * when that matters, which for these guards it always does.
 */
export function isInside(point: Corner, corners: readonly Corner[]): boolean {
  const [x, y] = point
  let inside = false

  for (const [from, to] of edgesOf(corners)) {
    const crossesTheLine = from[1] > y !== to[1] > y

    if (!crossesTheLine) {
      continue
    }

    const crossingX =
      from[0] + ((y - from[1]) / (to[1] - from[1])) * (to[0] - from[0])

    if (x < crossingX) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Is this point properly inside, rather than sitting on the outline?
 *
 * This is the distinction the whole overlap check rests on. Two places that
 * share a border share their corners exactly, so every shared corner sits
 * ON the neighbour's outline. Counting those as inside would report every
 * border on the map as an overlap.
 */
export function isWithin(point: Corner, corners: readonly Corner[]): boolean {
  return !isOnEdge(point, corners) && isInside(point, corners)
}

/**
 * Where along this edge it meets the outline of another shape.
 *
 * Answers are fractions of the way along, always including the two ends.
 * Edges that lie along one another are skipped: they meet everywhere, and
 * everywhere is nowhere useful.
 */
function meetingPointsAlong(
  edge: readonly [Corner, Corner],
  corners: readonly Corner[],
): number[] {
  const [from, to] = edge
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const found = [0, 1]

  for (const [otherFrom, otherTo] of edgesOf(corners)) {
    const otherX = otherTo[0] - otherFrom[0]
    const otherY = otherTo[1] - otherFrom[1]
    const turn = alongX * otherY - alongY * otherX

    // The two edges point the same way, so they never cross.
    if (Math.abs(turn) < 1e-12) {
      continue
    }

    const gapX = otherFrom[0] - from[0]
    const gapY = otherFrom[1] - from[1]
    const howFar = (gapX * otherY - gapY * otherX) / turn
    const howFarAlongTheOther = (gapX * alongY - gapY * alongX) / turn

    if (
      howFar > 0 &&
      howFar < 1 &&
      howFarAlongTheOther >= 0 &&
      howFarAlongTheOther <= 1
    ) {
      found.push(howFar)
    }
  }

  return [...new Set(found)].sort((one, two) => one - two)
}

/**
 * Does any part of this outline run through the inside of that shape?
 *
 * Cut each edge at every point where it meets the other outline, then ask
 * where the middle of each piece lands. A piece whose middle is properly
 * inside proves the two shapes share ground.
 *
 * Cutting the edges up is the part that matters. Testing corners alone is
 * the obvious approach and it is not enough: two rectangles can overlap
 * with every single corner sitting ON the other one's outline, and a
 * corners-only check calls that fine. That was found by a test, having
 * been written wrong first.
 */
function partInside(
  one: readonly Corner[],
  two: readonly Corner[],
): Corner | null {
  for (const edge of edgesOf(one)) {
    const [from, to] = edge
    const alongX = to[0] - from[0]
    const alongY = to[1] - from[1]
    const meetings = meetingPointsAlong(edge, two)

    for (let at = 0; at + 1 < meetings.length; at += 1) {
      const middle = ((meetings[at] as number) + (meetings[at + 1] as number)) / 2
      const point: Corner = [
        from[0] + middle * alongX,
        from[1] + middle * alongY,
      ]

      if (isWithin(point, two)) {
        return point
      }
    }
  }

  return null
}

/**
 * Do these two shapes claim the same ground?
 *
 * Returns a point that proves it, so the complaint can say WHERE. Returns
 * null when they are apart, or merely touch along a shared border.
 *
 * Both ways round, because one shape sitting wholly inside another shows
 * up from the inner one's side only.
 */
export function overlapBetween(
  one: readonly Corner[],
  two: readonly Corner[],
): Corner | null {
  return partInside(one, two) ?? partInside(two, one)
}

/** Roughly how much ground a shape covers, for comparing two of them. */
export function roomTakenBy(corners: readonly Corner[]): number {
  if (corners.length < 3) {
    return 0
  }

  let twiceTheArea = 0

  for (const [from, to] of edgesOf(corners)) {
    twiceTheArea += from[0] * to[1] - to[0] * from[1]
  }

  return Math.abs(twiceTheArea) / 2
}
