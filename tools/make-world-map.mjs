import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Build the world map from a traced outline. Plan task 5.8.
 *
 * Nick's words about the first world map: "far too blocky with not enough
 * detail". It was drawn by hand from rectangles, and it looked like it.
 *
 * The shapes now come from a real tracing of the classic board, and this
 * turns that tracing into a map Conquest can play. Three jobs, in order,
 * and the order matters:
 *
 * 1. FLATTEN. The tracing is cubic curves with a point about every unit.
 * 2. SIMPLIFY. That is far more detail than the game needs, and Nick said
 *    so: "demo1 is a bit too detailed". Ramer-Douglas-Peucker keeps the
 *    corners that make a coastline recognisable and drops the rest.
 * 3. SNAP. Simplifying moves points, and two neighbours simplified apart
 *    no longer share a border. Every point within a short distance of
 *    another is pulled onto one shared point, which is what spec S32 asks
 *    for and what the overlap guard of spec 3.2 checks.
 *
 * Run it with:  node tools/make-world-map.mjs
 *
 * SOURCE AND CREDIT. The outlines are traced from "Risk board" by Gr0gmint
 * on Wikimedia Commons, used under CC BY-SA 3.0 and simplified here. That
 * licence asks for credit and asks that the result be shared on the same
 * terms, so the map file says so and so does the game.
 */

const SOURCE = process.argv[2] ?? 'C:/Users/nick2/Downloads/Conquest-demo1.svg'
const WRITE_TO = 'src/maps/world.ts'

/**
 * How far a point may be moved when simplifying, in map units.
 *
 * The board is about 720 across. At 1.6 a coastline keeps its bays and
 * peninsulas and loses the wobble between them. Raise it for a plainer
 * map, lower it for a busier one.
 */
/**
 * Chosen by measuring, not by eye. At 1.2 the map keeps 2,140 corners out
 * of the tracing's 4,582, which is about half: less than Nick's "a bit too
 * detailed" and a long way from the rectangles he called "far too blocky".
 *
 * It also sets how badly two neighbours can disagree about where their
 * border runs, because that error is what simplifying leaves behind. At
 * 1.2 the worst is 0.89 units. At 1.6 it is 2.11, which is close enough to
 * a real fault to be worth avoiding.
 */
const SIMPLIFY_TO = Number(process.env['SIMPLIFY'] ?? 1.2)

// ------------------------------------------------------------ the tracing

function pathsIn(svg) {
  const found = new Map()
  const pattern = /<path\b[^>]*?\sid="([^"]+)"[^>]*?\sd="([^"]+)"/g
  let match

  while ((match = pattern.exec(svg)) !== null) {
    found.set(match[1], match[2])
  }

  return found
}

/** Turn a path into a list of points, curves flattened to their ends. */
function pointsIn(d) {
  const numbers = d.match(/[MCLZmclz]|-?[\d.]+/g) ?? []
  const points = []
  let at = 0
  let command = 'M'
  let x = 0
  let y = 0

  const take = () => Number(numbers[at++])

  while (at < numbers.length) {
    const next = numbers[at]

    if (/[MCLZmclz]/.test(next)) {
      command = next
      at += 1
      continue
    }

    if (command === 'M' || command === 'L') {
      x = take()
      y = take()
    } else if (command === 'm' || command === 'l') {
      x += take()
      y += take()
    } else if (command === 'C') {
      take(); take(); take(); take()
      x = take()
      y = take()
    } else if (command === 'c') {
      take(); take(); take(); take()
      x += take()
      y += take()
    } else {
      at += 1
      continue
    }

    points.push([x, y])
  }

  return points
}

// ----------------------------------------------------------- simplifying

function awayFromLine(point, from, to) {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const length = Math.hypot(alongX, alongY)

  if (length === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1])
  }

  return (
    Math.abs(
      alongY * (point[0] - from[0]) - alongX * (point[1] - from[1]),
    ) / length
  )
}

/**
 * Ramer-Douglas-Peucker.
 *
 * Keep the point furthest from the straight line between the two ends. If
 * even that one is closer than the tolerance, the whole stretch becomes
 * that straight line. Then do the same to each half.
 */
function simplified(points, tolerance) {
  if (points.length < 3) {
    return points
  }

  let furthest = 0
  let at = 0

  for (let step = 1; step < points.length - 1; step += 1) {
    const away = awayFromLine(points[step], points[0], points[points.length - 1])

    if (away > furthest) {
      furthest = away
      at = step
    }
  }

  if (furthest <= tolerance) {
    return [points[0], points[points.length - 1]]
  }

  return [
    ...simplified(points.slice(0, at + 1), tolerance).slice(0, -1),
    ...simplified(points.slice(at), tolerance),
  ]
}

/** A ring, simplified without letting its two ends drift apart. */
function simplifiedRing(points, tolerance) {
  const closed = [...points, points[0]]
  const kept = simplified(closed, tolerance)

  kept.pop()
  return kept
}

// ------------------------------------------------------ mending the tracing

/**
 * Push apart the places the tracing has overlapping.
 *
 * The tracing is artwork, and artwork is drawn by eye. Measured, twelve
 * pairs of neighbours share a little ground: between 0.4 and 21 square
 * units on a board of 537,600. Invisible, and still against the rules of
 * spec 3.2, which allow two places to share a border and no ground at all.
 *
 * The mend is small and local. A point belonging to ONE place only, which
 * has strayed inside its neighbour, is moved out to the nearest spot on
 * that neighbour's outline. Points shared BETWEEN the two are left exactly
 * where they are, because those are the border itself, and moving one
 * would tear the border open.
 *
 * Done before the simplifying, so the simplifying sees a clean map.
 */

function insideRing(point, ring) {
  let inside = false

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]

    if (from[1] > point[1] !== to[1] > point[1]) {
      const across =
        from[0] + ((point[1] - from[1]) / (to[1] - from[1])) * (to[0] - from[0])

      if (point[0] < across) {
        inside = !inside
      }
    }
  }

  return inside
}

/** The closest spot on an outline to a point, and how far away it is. */
function nearestOn(ring, point) {
  let best = ring[0]
  let nearest = Infinity

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]
    const alongX = to[0] - from[0]
    const alongY = to[1] - from[1]
    const length = Math.hypot(alongX, alongY)
    const howFar =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) /
                (length * length),
            ),
          )
    const spot = [from[0] + howFar * alongX, from[1] + howFar * alongY]
    const away = Math.hypot(point[0] - spot[0], point[1] - spot[1])

    if (away < nearest) {
      nearest = away
      best = spot
    }
  }

  return { spot: best, away: nearest }
}

function boxOf(ring) {
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)

  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function apart(one, two) {
  return one[2] < two[0] || two[2] < one[0] || one[3] < two[1] || two[3] < one[1]
}

/** How far outside a neighbour a mended point is put. */
const CLEAR_BY = 0.35

function mend(shapes, passes = 4) {
  const names = [...shapes.keys()]
  let moved = 0

  for (let pass = 0; pass < passes; pass += 1) {
    const belongsTo = membership(shapes)
    const boxes = new Map(names.map((n) => [n, boxOf(shapes.get(n))]))
    let movedThisPass = 0

    for (const name of names) {
      const mine = shapes.get(name)

      for (const other of names) {
        if (other === name || apart(boxes.get(name), boxes.get(other))) {
          continue
        }

        const theirs = shapes.get(other)

        for (let at = 0; at < mine.length; at += 1) {
          const point = mine[at]

          // A point on the border between the two IS the border. Leave it.
          // A point already moved this pass is in the map under its old
          // place, so it comes back as nobody's, which is right: it now
          // belongs to this outline alone.
          const alsoIn = belongsTo.get(whereItIs(point)) ?? ''

          if (alsoIn.includes(other)) {
            continue
          }

          if (!insideRing(point, theirs)) {
            continue
          }

          const { spot } = nearestOn(theirs, point)
          const outX = point[0] - spot[0]
          const outY = point[1] - spot[1]
          const length = Math.hypot(outX, outY) || 1

          mine[at] = [
            Number((spot[0] + (outX / length) * CLEAR_BY).toFixed(2)),
            Number((spot[1] + (outY / length) * CLEAR_BY).toFixed(2)),
          ]
          movedThisPass += 1
        }
      }
    }

    moved += movedThisPass

    if (movedThisPass === 0) {
      break
    }
  }

  return moved
}

/**
 * The second half of the mend: outlines that CROSS.
 *
 * Moving strayed corners out is not enough. Two outlines can cross each
 * other with no corner of either inside the other, the way two pencil
 * strokes cross, and that still leaves ground claimed twice. The overlap
 * guard finds those by cutting each edge at every place it meets the
 * other outline, so the mend has to do the same.
 *
 * For each pair: put a corner at every crossing, then push out any corner
 * that is inside. With corners AT the crossings there is always something
 * to push.
 *
 * Done after simplifying, on the shapes as they will be. It can leave a
 * hairline gap of a third of a unit on a board 720 across, which nothing
 * can see and no rule forbids. An overlap IS forbidden, and that is the
 * trade being made.
 */
function crossingsOf(from, to, ring) {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const found = []

  for (let at = 0; at < ring.length; at += 1) {
    const other = ring[at]
    const next = ring[(at + 1) % ring.length]
    const otherX = next[0] - other[0]
    const otherY = next[1] - other[1]
    const turn = alongX * otherY - alongY * otherX

    if (Math.abs(turn) < 1e-12) {
      continue
    }

    const gapX = other[0] - from[0]
    const gapY = other[1] - from[1]
    const howFar = (gapX * otherY - gapY * otherX) / turn
    const alongTheOther = (gapX * alongY - gapY * alongX) / turn

    if (howFar > 1e-9 && howFar < 1 - 1e-9 && alongTheOther >= 0 && alongTheOther <= 1) {
      found.push(howFar)
    }
  }

  return [...new Set(found)].sort((one, two) => one - two)
}

/** How short a piece has to be for a pushed line to hug an outline. */
const CLOSE_STEPS = 1.5

function withCrossings(ring, other) {
  const out = []

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]
    const marks = [0, ...crossingsOf(from, to, other), 1]
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])

    for (let step = 0; step < marks.length - 1; step += 1) {
      const start = marks[step]
      const end = marks[step + 1]
      const piece = length * (end - start)

      // Cut long pieces up. Two pushed corners a long way apart are joined
      // by a straight line, and a straight line cuts the corner off a
      // curved coast, straight back into the neighbour. That is why the
      // pushing would not settle: it undid itself every pass.
      const howFar = start

      out.push([
        Number((from[0] + howFar * (to[0] - from[0])).toFixed(3)),
        Number((from[1] + howFar * (to[1] - from[1])).toFixed(3)),
      ])
    }
  }

  return out
}

/** Drop corners that sit on a straight line between their neighbours. */
function withoutStraightRuns(ring, tolerance) {
  const kept = []

  for (let at = 0; at < ring.length; at += 1) {
    const before = kept[kept.length - 1] ?? ring[(at + ring.length - 1) % ring.length]
    const after = ring[(at + 1) % ring.length]

    if (awayFromLine(ring[at], before, after) > tolerance) {
      kept.push(ring[at])
    }
  }

  return kept.length >= 3 ? kept : ring
}

function unpick(shapes, passes = 40) {
  const names = [...shapes.keys()]

  for (let pass = 0; pass < passes; pass += 1) {
    let pushed = 0
    const shared = membership(shapes)

    // Unordered pairs, and only the SECOND one ever moves. Doing both
    // ways round made A give way to B and then B give way to A, over and
    // over, and it never settled. One of the two has to be the one that
    // moves, and which one hardly matters as long as it is always the same
    // one.
    for (let first = 0; first < names.length; first += 1) {
      for (let second = first + 1; second < names.length; second += 1) {
        const other = names[first]
        const name = names[second]
        const mine = shapes.get(name)
        const theirs = shapes.get(other)

        if (apart(boxOf(mine), boxOf(theirs))) {
          continue
        }

        const marked = withCrossings(mine, theirs)
        let changed = marked.length !== mine.length

        for (let at = 0; at < marked.length; at += 1) {
          // A corner the two SHARE is the border itself. Pushing it would
          // tear the border open and make a worse overlap somewhere else.
          if ((shared.get(whereItIs(marked[at])) ?? '').includes(other)) {
            continue
          }

          if (!insideRing(marked[at], theirs)) {
            continue
          }

          const { spot } = nearestOn(theirs, marked[at])
          const outX = marked[at][0] - spot[0]
          const outY = marked[at][1] - spot[1]
          const length = Math.hypot(outX, outY) || 1

          marked[at] = [
            Number((spot[0] + (outX / length) * CLEAR_BY).toFixed(2)),
            Number((spot[1] + (outY / length) * CLEAR_BY).toFixed(2)),
          ]
          changed = true
          pushed += 1
        }

        if (changed) {
          shapes.set(
            name,
            marked.filter(
              (point, at) =>
                at === 0 || whereItIs(point) !== whereItIs(marked[at - 1]),
            ),
          )
        }
      }
    }

    if (pushed === 0) {
      return pass
    }
  }

  return passes
}

// ------------------------------------------------- keeping borders shared

/**
 * Simplify each shared BORDER once, not each shape twice.
 *
 * This is the whole difficulty, and the first attempt got it wrong. If two
 * neighbours are simplified on their own, the border between them is
 * simplified twice, differently, and the two no longer meet. That produced
 * 17 overlaps, every one of them a sliver along a border.
 *
 * The tracing already shares its points: 875 of them belong to more than
 * one shape. So each outline can be cut into stretches that run between
 * junctions, each stretch simplified ONCE, and the shapes built again from
 * those stretches. Both sides of a border then get the identical line,
 * because it IS the identical line.
 *
 * This is what mapping people call topology-preserving simplification, and
 * it is why a map is not just a pile of drawings.
 */

function whereItIs(point) {
  return `${point[0]},${point[1]}`
}

/** Which shapes each point belongs to. */
function membership(shapes) {
  const belongs = new Map()

  for (const [name, points] of shapes) {
    for (const point of points) {
      const key = whereItIs(point)
      const already = belongs.get(key) ?? new Set()

      already.add(name)
      belongs.set(key, already)
    }
  }

  const named = new Map()

  for (const [key, names] of belongs) {
    named.set(key, [...names].sort().join('|'))
  }

  return named
}

/** Cut one outline into the stretches between its junctions. */
function stretchesOf(points, belongsTo) {
  const owners = points.map((point) => belongsTo.get(whereItIs(point)))
  const count = points.length

  const isJunction = (at) =>
    owners[at] !== owners[(at + count - 1) % count] ||
    owners[at] !== owners[(at + 1) % count]

  const junctions = []

  for (let at = 0; at < count; at += 1) {
    if (isJunction(at)) {
      junctions.push(at)
    }
  }

  // An island shares nothing with anybody. The whole ring is one stretch.
  if (junctions.length < 2) {
    return [{ points, closed: true }]
  }

  const stretches = []

  for (let step = 0; step < junctions.length; step += 1) {
    const from = junctions[step]
    const to = junctions[(step + 1) % junctions.length]
    const run = [points[from]]

    for (let at = (from + 1) % count; ; at = (at + 1) % count) {
      run.push(points[at])
      if (at === to) break
    }

    if (run.length > 1) {
      stretches.push({ points: run, closed: false })
    }
  }

  return stretches
}

/** A name for a stretch that is the same whichever way round it is read. */
function nameOfStretch(points) {
  const forwards = points.map(whereItIs).join(' ')
  const backwards = [...points].reverse().map(whereItIs).join(' ')

  return forwards < backwards ? forwards : backwards
}

function simplifyTogether(shapes, tolerance) {
  const belongsTo = membership(shapes)
  const done = new Map()
  const out = new Map()

  for (const [name, points] of shapes) {
    const rebuilt = []

    for (const stretch of stretchesOf(points, belongsTo)) {
      const key = nameOfStretch(stretch.points)

      if (!done.has(key)) {
        done.set(
          key,
          stretch.closed
            ? simplifiedRing(stretch.points, tolerance)
            : simplified(stretch.points, tolerance),
        )
      }

      const kept = done.get(key)

      // The stretch was simplified in whichever direction it was first
      // met. Put it back the way THIS outline runs.
      const theSameWayRound =
        whereItIs(kept[0]) === whereItIs(stretch.points[0])
      const inOrder = theSameWayRound ? kept : [...kept].reverse()

      for (const point of stretch.closed ? inOrder : inOrder.slice(0, -1)) {
        rebuilt.push(point)
      }
    }

    // A snap can leave the same point twice over. Keep one.
    const tidy = rebuilt.filter(
      (point, at) =>
        at === 0 || whereItIs(point) !== whereItIs(rebuilt[at - 1]),
    )

    while (
      tidy.length > 3 &&
      whereItIs(tidy[0]) === whereItIs(tidy[tidy.length - 1])
    ) {
      tidy.pop()
    }

    out.set(name, tidy)
  }

  return out
}

// ------------------------------------------------------ where a name goes

function isInside(point, ring) {
  let inside = false

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]

    if (from[1] > point[1] !== to[1] > point[1]) {
      const across =
        from[0] +
        ((point[1] - from[1]) / (to[1] - from[1])) * (to[0] - from[0])

      if (point[0] < across) {
        inside = !inside
      }
    }
  }

  return inside
}

function awayFromEdge(point, ring) {
  let nearest = Infinity

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]
    const alongX = to[0] - from[0]
    const alongY = to[1] - from[1]
    const length = Math.hypot(alongX, alongY)
    const howFar =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point[0] - from[0]) * alongX + (point[1] - from[1]) * alongY) /
                (length * length),
            ),
          )

    nearest = Math.min(
      nearest,
      Math.hypot(
        point[0] - (from[0] + howFar * alongX),
        point[1] - (from[1] + howFar * alongY),
      ),
    )
  }

  return nearest
}

/**
 * The roomiest point inside a shape.
 *
 * NOT the average of the corners. On a shape shaped like a horseshoe the
 * average lands in the gap, and the name would sit on the sea or on the
 * neighbour. This looks for the point furthest from any edge, which is
 * where a name has the most room around it.
 */
function roomiestIn(ring) {
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)

  let best = [(left + right) / 2, (top + bottom) / 2]
  let mostRoom = -1

  const steps = 26

  for (let downStep = 1; downStep < steps; downStep += 1) {
    for (let acrossStep = 1; acrossStep < steps; acrossStep += 1) {
      const point = [
        left + ((right - left) * acrossStep) / steps,
        top + ((bottom - top) * downStep) / steps,
      ]

      if (!isInside(point, ring)) {
        continue
      }

      const room = awayFromEdge(point, ring)

      if (room > mostRoom) {
        mostRoom = room
        best = point
      }
    }
  }

  return { at: [Math.round(best[0]), Math.round(best[1])], room: mostRoom }
}

// ------------------------------------------------------------- the output

/** What each place is called, which continent it is in, and its neighbours. */
const PLACES = JSON.parse(
  readFileSync(new URL('./world-places.json', import.meta.url), 'utf8'),
)

function main() {
  const svg = readFileSync(SOURCE, 'utf8')
  const traced = pathsIn(svg)

  const shapes = new Map()
  let before = 0

  for (const place of PLACES.places) {
    const d = traced.get(place.tracedAs)

    if (d === undefined) {
      throw new Error(`The tracing has no shape called "${place.tracedAs}".`)
    }

    const points = pointsIn(d)

    before += points.length
    shapes.set(place.id, points)
  }

  const mended = mend(shapes)

  console.log(`points moved to mend the tracing: ${mended}`)

  const after = simplifyTogether(shapes, SIMPLIFY_TO)

  const passes = unpick(after)

  console.log(`passes needed to unpick the crossings: ${passes}`)
  const kept = [...after.values()].reduce((sum, ring) => sum + ring.length, 0)

  console.log(`traced points: ${before}`)
  console.log(`after simplifying and snapping: ${kept}`)
  console.log(`smallest shape: ${Math.min(...[...after.values()].map((r) => r.length))} corners`)

  const lines = []

  for (const place of PLACES.places) {
    const ring = after.get(place.id).map(([x, y]) => [Math.round(x), Math.round(y)])
    const where = roomiestIn(ring)

    lines.push({ ...place, corners: ring, labelAt: where.at, room: where.room })
  }

  // The frame, measured rather than copied from the tracing. The tracing's
  // own box cut the bottom off South America and Australia, because the
  // tracing had labels and a key outside the shapes and we do not.
  const xs = lines.flatMap((p) => p.corners.map(([x]) => x))
  const ys = lines.flatMap((p) => p.corners.map(([, y]) => y))
  const names = lines.map((p) => p.labelAt)
  const margin = 14
  // A name hangs 30 below its count, so the box must reach past the name
  // rather than past the southernmost coast.
  const nameRoom = 34
  const left = Math.min(...xs, ...names.map(([x]) => x)) - margin
  const top = Math.min(...ys, ...names.map(([, y]) => y)) - margin
  const right = Math.max(...xs, ...names.map(([x]) => x)) + margin
  const bottom = Math.max(...ys, ...names.map(([, y]) => y + nameRoom)) + margin

  const viewBox = `${Math.round(left)} ${Math.round(top)} ${Math.round(right - left)} ${Math.round(bottom - top)}`

  console.log(`frame fitted to the drawing: ${viewBox}`)

  writeFileSync(WRITE_TO, asTypeScript(lines, { ...PLACES, viewBox }))
  console.log(`wrote ${WRITE_TO}`)
}

function asCorners(corners) {
  const rows = []

  for (let at = 0; at < corners.length; at += 6) {
    rows.push(
      '      ' +
        corners
          .slice(at, at + 6)
          .map(([x, y]) => `[${x}, ${y}]`)
          .join(', ') +
        ',',
    )
  }

  return rows.join('\n')
}

function asTypeScript(places, meta) {
  const byRegion = new Map()

  for (const place of places) {
    byRegion.set(place.region, [...(byRegion.get(place.region) ?? []), place])
  }

  const blocks = []

  for (const region of meta.regions) {
    blocks.push(
      `  // ${'-'.repeat(Math.max(2, 62 - region.name.length))} ${region.name} (${
        byRegion.get(region.id).length
      })`,
    )

    for (const place of byRegion.get(region.id)) {
      blocks.push(`  {
    id: '${place.id}',
    name: '${place.name}',
    shortName: '${place.shortName}',
    regionId: '${place.region}',
    borders: [
${place.borders
  .map((b) => `      '${b}',`)
  .join('\n')}
    ],
    corners: [
${asCorners(place.corners)}
    ],
    labelAt: at(${place.labelAt[0]}, ${place.labelAt[1]}),${
      place.isIsland ? '\n    isIsland: true,' : ''
    }
  },`)
    }
  }

  return `import type { GameMap, Point, TerritoryDefinition } from '../engine'
import { pathFrom } from './shapes'

/**
 * The world. Nick's request, plan task 5.8.
 *
 * WRITTEN BY A TOOL. Do not change the shapes by hand: run
 * \`node tools/make-world-map.mjs\` instead. Everything a person decides
 * lives in \`tools/world-places.json\`, which holds the names, the
 * continents and who borders whom.
 *
 * Forty-two places in six continents, the layout anybody who has played the
 * classic war game already knows, so nobody has to learn a new world before
 * they can play.
 *
 * **Where the shapes come from.** They are traced from "Risk board" by
 * Gr0gmint on Wikimedia Commons, used under CC BY-SA 3.0 and simplified
 * here to about a ${meta.simplifiedTo} unit tolerance. The first attempt at
 * this map was drawn from rectangles by hand, and Nick's verdict was "far
 * too blocky with not enough detail". He was right.
 *
 * That licence asks for credit and asks that the result be shared on the
 * same terms. THIS FILE IS THEREFORE CC BY-SA 3.0, and the game says so on
 * the new game screen.
 *
 * **Asia pays 7 and is nearly impossible to hold.** Twelve places and five
 * ways in. Australia pays 2, has four places and ONE way in, from Siam to
 * Indonesia. A bonus you can keep beats a bigger one you cannot.
 */

function at(x: number, y: number): Point {
  return { x, y }
}

interface Place {
  readonly id: string
  readonly name: string
  readonly shortName: string
  readonly regionId: string
  readonly borders: readonly string[]
  readonly corners: ReadonlyArray<readonly [number, number]>
  readonly labelAt: Point
  readonly isIsland?: boolean
}

const PLACES: readonly Place[] = [
${blocks.join('\n')}
]

function toTerritory(place: Place): TerritoryDefinition {
  return {
    id: place.id,
    name: place.name,
    shortName: place.shortName,
    regionId: place.regionId,
    borders: place.borders,
    shape: pathFrom(place.corners),
    labelAt: place.labelAt,
    ...(place.isIsland === true ? { isIsland: true } : {}),
  }
}

export const WORLD: GameMap = {
  id: 'world',
  name: 'World',
  viewBox: '${meta.viewBox}',

  /**
   * What each continent pays for holding it.
   *
   * The numbers the classic board uses. They are balanced against the
   * number of ways in, not against size: Asia pays the most and almost
   * nobody holds it, Australia pays the least and wins games.
   */
  regions: [
${meta.regions
  .map(
    (r) =>
      `    { id: '${r.id}', name: '${r.name}', bonus: ${r.bonus}, outline: '${r.outline}' },`,
  )
  .join('\n')}
  ],

  territories: PLACES.map(toTerritory),
}
`
}

main()
