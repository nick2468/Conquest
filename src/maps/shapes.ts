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

/**
 * Turn a list of corners into an SVG path.
 *
 * The maps are written as corners, not as paths. That is not a style
 * choice. Neighbouring places then share the exact same points, so a border
 * cannot end up with a sliver of no-man's land or an overlap along it, and
 * a map file is something a person can read and change.
 */
export function pathFrom(corners: ReadonlyArray<Corner>): string {
  return `M ${corners.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`
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
export function isOnEdge(
  point: Corner,
  corners: readonly Corner[],
  within: number = TOUCHING,
): boolean {
  return edgesOf(corners).some(
    ([from, to]) => distanceToEdge(point, from, to) <= within,
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
function everyPartInside(
  one: readonly Corner[],
  two: readonly Corner[],
): Corner[] {
  const found: Corner[] = []

  for (const corner of one) {
    if (isWithin(corner, two)) {
      found.push(corner)
    }
  }

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
        found.push(point)
      }
    }
  }

  return found
}

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

/**
 * The edges of these shapes that are borders BETWEEN them.
 *
 * Nick: "don't double up borders where an inner border runs alongside a
 * continent border, keep just the continent border." To do that the game
 * has to know which parts of a place's outline face a neighbour and which
 * parts face the sea, and an outline on its own does not say.
 *
 * An edge counts as inside when its middle sits on another shape's
 * outline. NOT when the two share the edge exactly: they almost never do.
 * A border between two places is one long straight line on the cell side
 * and a row of short pieces on the coast side, so only 8 of the world
 * map's 964 edges match end for end. Position is what matters, not how
 * each side happened to be cut up.
 */
export function edgesBetween(
  shapes: ReadonlyArray<readonly Corner[]>,
): Array<[Corner, Corner]> {
  const boxes = shapes.map((ring) => {
    const xs = ring.map(([x]) => x)
    const ys = ring.map(([, y]) => y)

    return [
      Math.min(...xs) - TOUCHES,
      Math.min(...ys) - TOUCHES,
      Math.max(...xs) + TOUCHES,
      Math.max(...ys) + TOUCHES,
    ] as const
  })

  const inside: Array<[Corner, Corner]> = []

  for (let which = 0; which < shapes.length; which += 1) {
    for (const [from, to] of edgesOf(shapes[which] as readonly Corner[])) {
      const middle: Corner = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]

      for (let other = 0; other < shapes.length; other += 1) {
        if (other === which) {
          continue
        }

        const box = boxes[other] as readonly number[]

        if (
          (middle[0] as number) < (box[0] as number) ||
          (middle[0] as number) > (box[2] as number) ||
          (middle[1] as number) < (box[1] as number) ||
          (middle[1] as number) > (box[3] as number)
        ) {
          continue
        }

        if (isOnEdge(middle, shapes[other] as readonly Corner[], TOUCHES)) {
          inside.push([from, to])
          break
        }
      }
    }
  }

  return inside
}

/** How near a middle has to be to a neighbour's outline to count. */
const TOUCHES = 0.6

/**
 * How far these two outlines run along one another.
 *
 * Zero means they do not share a border. Anything else is the length of the
 * longest stretch where they touch.
 *
 * The map editor uses it to work borders out from the shapes, which is the
 * job people get wrong most often: a border typed on one side and forgotten
 * on the other. It cannot find them all. Melbourne to Launceston crosses
 * Bass Strait and the two shapes never touch, so a sea crossing stays
 * something a person says.
 */
export function touchingLength(
  one: readonly Corner[],
  two: readonly Corner[],
): number {
  let most = 0

  for (const edge of edgesOf(one)) {
    for (const other of edgesOf(two)) {
      most = Math.max(most, sharedLength(edge, other))
    }
  }

  return most
}

/** How much of one edge lies along another, when the two are in line. */
function sharedLength(
  one: readonly [Corner, Corner],
  two: readonly [Corner, Corner],
): number {
  const [from, to] = one

  // Not in line, so they cross at a point at most, which has no length.
  if (
    distanceToEdge(two[0], from, to) > TOUCHING ||
    distanceToEdge(two[1], from, to) > TOUCHING
  ) {
    return 0
  }

  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const length = Math.hypot(alongX, alongY)

  if (length === 0) {
    return 0
  }

  const howFar = (point: Corner): number =>
    ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) / length

  const starts = Math.max(0, Math.min(howFar(two[0]), howFar(two[1])))
  const ends = Math.min(length, Math.max(howFar(two[0]), howFar(two[1])))

  return Math.max(0, ends - starts)
}

/**
 * How far the deepest shared point lies inside the other shape.
 *
 * This is the measure that tells a fault from a wobble, and it took some
 * measuring to find. Area does not: a border-long hairline and a small
 * real mistake come out about the same. Depth separates them cleanly.
 *
 * Measured on the maps we have: a coastline traced by eye and then
 * simplified disagrees with its neighbour by less than a unit, and how
 * much less is set by how hard it was simplified. A city drawn on top of
 * the place around it, which is deliberate, is 3 to 24 units deep. Nothing
 * lands in between.
 */
export function overlapDepth(
  one: readonly Corner[],
  two: readonly Corner[],
): number {
  const howFarIn = (point: Corner, ring: readonly Corner[]): number => {
    let nearest = Infinity

    for (const [from, to] of edgesOf(ring)) {
      nearest = Math.min(nearest, distanceToEdge(point, from, to))
    }

    return nearest
  }

  let deepest = 0

  // Corners are not enough. Two rectangles can overlap by half their width
  // with every corner sitting ON the other one's outline, and a
  // corners-only measure would call that nothing at all. So the same walk
  // the overlap check uses is walked again, and the middle of every piece
  // that lies inside counts.
  for (const point of everyPartInside(one, two)) {
    deepest = Math.max(deepest, howFarIn(point, two))
  }

  for (const point of everyPartInside(two, one)) {
    deepest = Math.max(deepest, howFarIn(point, one))
  }

  return deepest
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
