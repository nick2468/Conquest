import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Draw the world map. Plan task 5.8.
 *
 * OURS, with no strings attached. An earlier go traced somebody else's
 * drawing of the board, which meant a licence asking for credit and asking
 * that the result be shared on the same terms. Nick did not want that, and
 * he was right: a good map of the world is public property.
 *
 * So the coasts come from Natural Earth, whose own words are "All versions
 * of Natural Earth raster + vector map data found on this website are in
 * the public domain... No permission is needed to use Natural Earth.
 * Crediting the authors is unnecessary." The data sits in `tools/data`, so
 * a build needs no internet.
 *
 * **The coasts are real and the inland borders are ours.** That is how the
 * world looks and how the classic board looks: a coastline wanders, and a
 * border between two provinces runs in a line. Each place is the land
 * inside a straight-sided CELL, and the cells are the part a person
 * designs. They live in `tools/world-cells.json` beside the names.
 *
 * Cutting land to a cell is Sutherland-Hodgman clipping, which is short and
 * reliable so long as every cell is convex. The tool checks that. Where two
 * cells share an edge, the two places share it exactly, which is what spec
 * S32 asks for, and it is what saves this map from the slivers the traced
 * one could never quite lose.
 *
 * Run it with:  node tools/make-world-map.mjs
 */

const LAND = 'tools/data/ne-110m-land.geojson'
const CELLS = 'tools/world-cells.json'
const WRITE_TO = 'src/maps/world.ts'

/** How far a coast may be moved when simplifying, in degrees. */
const SIMPLIFY_TO = Number(process.env['SIMPLIFY'] ?? 0.55)

/** How many units across the picture is for each degree of longitude. */
const ACROSS = 2.6

/**
 * How much taller than wide a degree is drawn.
 *
 * Plain 1 gives the flat projection from a schoolroom wall. Above that
 * stretches the far north, which is what a board map does so Greenland and
 * Siberia are big enough to fight over.
 */
const TALLER = 1.25

// ------------------------------------------------------------- the coasts

function ringsIn(geoJson) {
  const rings = []

  for (const feature of geoJson.features) {
    const shape = feature.geometry
    const pieces =
      shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates

    // The first ring of each piece is the outside. The rest are lakes,
    // which a board game does not need.
    for (const piece of pieces) {
      rings.push(piece[0])
    }
  }

  return rings
}

function roomTaken(ring) {
  let twice = 0

  for (let at = 0; at < ring.length; at += 1) {
    const from = ring[at]
    const to = ring[(at + 1) % ring.length]

    twice += from[0] * to[1] - to[0] * from[1]
  }

  return Math.abs(twice) / 2
}

// ------------------------------------------------------------ simplifying

function awayFromLine(point, from, to) {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const length = Math.hypot(alongX, alongY)

  if (length === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1])
  }

  return (
    Math.abs(alongY * (point[0] - from[0]) - alongX * (point[1] - from[1])) /
    length
  )
}

/** Ramer-Douglas-Peucker: keep the corners, drop the wobble between them. */
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

function simplifiedRing(ring, tolerance) {
  const kept = simplified([...ring, ring[0]], tolerance)

  kept.pop()
  return kept
}

// ------------------------------------------------------ cutting to a cell

function whichSide(from, to, point) {
  return (
    (to[0] - from[0]) * (point[1] - from[1]) -
    (to[1] - from[1]) * (point[0] - from[0])
  )
}

/** Which way round a cell is drawn, and a complaint if it bends both ways. */
function checkCell(name, cell) {
  let sign = 0

  for (let at = 0; at < cell.length; at += 1) {
    const turn = whichSide(
      cell[at],
      cell[(at + 1) % cell.length],
      cell[(at + 2) % cell.length],
    )

    if (Math.abs(turn) < 1e-9) {
      continue
    }

    const way = turn > 0 ? 1 : -1

    if (sign === 0) {
      sign = way
    } else if (way !== sign) {
      throw new Error(
        `The cell for "${name}" bends both ways at corner ${at + 1}. ` +
          `A cell has to be convex or the cutting goes wrong.`,
      )
    }
  }

  return sign
}

function crossingAt(from, to, edgeFrom, edgeTo) {
  const alongX = to[0] - from[0]
  const alongY = to[1] - from[1]
  const edgeX = edgeTo[0] - edgeFrom[0]
  const edgeY = edgeTo[1] - edgeFrom[1]
  const turn = alongX * edgeY - alongY * edgeX

  if (Math.abs(turn) < 1e-12) {
    return to
  }

  const gapX = edgeFrom[0] - from[0]
  const gapY = edgeFrom[1] - from[1]
  const howFar = (gapX * edgeY - gapY * edgeX) / turn

  return [from[0] + howFar * alongX, from[1] + howFar * alongY]
}

/**
 * The part of a shape lying inside a cell. Sutherland-Hodgman.
 *
 * Cut the shape against one side of the cell at a time. What survives all
 * of them is what was inside. It only works for a convex cell, which is
 * why the tool insists on one.
 */
function cutToCell(ring, cell, inside) {
  let kept = ring

  for (let at = 0; at < cell.length && kept.length > 0; at += 1) {
    const edgeFrom = cell[at]
    const edgeTo = cell[(at + 1) % cell.length]
    const next = []

    for (let step = 0; step < kept.length; step += 1) {
      const from = kept[step]
      const to = kept[(step + 1) % kept.length]
      const fromIn = whichSide(edgeFrom, edgeTo, from) * inside >= 0
      const toIn = whichSide(edgeFrom, edgeTo, to) * inside >= 0

      if (fromIn) {
        next.push(from)
      }

      if (fromIn !== toIn) {
        next.push(crossingAt(from, to, edgeFrom, edgeTo))
      }
    }

    kept = next
  }

  return kept
}

// ---------------------------------------------------------- the projection

function project([lon, lat]) {
  return [
    Number(((lon + 180) * ACROSS).toFixed(1)),
    Number(((90 - lat) * ACROSS * TALLER).toFixed(1)),
  ]
}

// ------------------------------------------------------- where a name goes

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
 * NOT the average of the corners: on a shape like a horseshoe the average
 * lands in the gap and the name sits on the sea. This looks for the point
 * furthest from any edge, which is where a name has the most room.
 */
function roomiestIn(ring) {
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const steps = 30

  let best = [(left + right) / 2, (top + bottom) / 2]
  let mostRoom = -1

  for (let down = 1; down < steps; down += 1) {
    for (let across = 1; across < steps; across += 1) {
      const point = [
        left + ((right - left) * across) / steps,
        top + ((bottom - top) * down) / steps,
      ]

      if (!insideRing(point, ring)) {
        continue
      }

      const room = awayFromEdge(point, ring)

      if (room > mostRoom) {
        mostRoom = room
        best = point
      }
    }
  }

  return [Math.round(best[0]), Math.round(best[1])]
}

// ------------------------------------------------------------------- build

function main() {
  const meta = JSON.parse(readFileSync(CELLS, 'utf8'))
  const land = ringsIn(JSON.parse(readFileSync(LAND, 'utf8')))
    .filter((ring) => roomTaken(ring) >= 0.4)
    // Antarctica is not somewhere anybody fights over here.
    .filter((ring) => Math.max(...ring.map(([, lat]) => lat)) > -55)
    .map((ring) => simplifiedRing(ring, SIMPLIFY_TO))

  console.log(`coastlines kept: ${land.length}`)

  const built = []

  for (const place of meta.places) {
    const inside = checkCell(place.id, place.cell)
    const pieces = []

    for (const ring of land) {
      const cut = cutToCell(ring, place.cell, inside)

      if (cut.length >= 3 && roomTaken(cut) > 0.05) {
        pieces.push(cut)
      }
    }

    if (pieces.length === 0) {
      throw new Error(`The cell for "${place.id}" catches no land at all.`)
    }

    pieces.sort((one, two) => roomTaken(two) - roomTaken(one))

    const corners = pieces[0]
      .map(project)
      .filter(
        (point, at, all) =>
          at === 0 || point[0] !== all[at - 1][0] || point[1] !== all[at - 1][1],
      )

    built.push({
      ...place,
      pieces: pieces.length,
      corners,
      labelAt: roomiestIn(corners),
    })
  }

  const several = built.filter((place) => place.pieces > 1)

  if (several.length > 0) {
    console.log(
      'made of several islands, biggest kept: ' +
        several.map((place) => `${place.id}(${place.pieces})`).join(' '),
    )
  }

  console.log(
    `places: ${built.length}, corners: ` +
      built.reduce((sum, place) => sum + place.corners.length, 0),
  )

  const xs = built.flatMap((place) => place.corners.map(([x]) => x))
  const ys = built.flatMap((place) => place.corners.map(([, y]) => y))
  const names = built.map((place) => place.labelAt)
  const edge = 14
  // A name hangs 30 below its count, so the frame reaches past the name
  // rather than past the southernmost coast.
  const nameRoom = 34
  const left = Math.round(Math.min(...xs, ...names.map(([x]) => x)) - edge)
  const top = Math.round(Math.min(...ys, ...names.map(([, y]) => y)) - edge)
  const right = Math.round(Math.max(...xs, ...names.map(([x]) => x)) + edge)
  const bottom = Math.round(
    Math.max(...ys, ...names.map(([, y]) => y + nameRoom)) + edge,
  )
  const viewBox = `${left} ${top} ${right - left} ${bottom - top}`

  console.log(`frame: ${viewBox}`)
  writeFileSync(WRITE_TO, asTypeScript(built, meta, viewBox))
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

function asTypeScript(places, meta, viewBox) {
  const blocks = []

  for (const region of meta.regions) {
    const mine = places.filter((place) => place.region === region.id)

    blocks.push(
      `  // ${'-'.repeat(Math.max(2, 58 - region.name.length))} ${region.name} (${mine.length})`,
    )

    for (const place of mine) {
      blocks.push(`  {
    id: '${place.id}',
    name: '${place.name}',
    shortName: '${place.shortName}',
    regionId: '${place.region}',
    borders: [
${place.borders.map((b) => `      '${b}',`).join('\n')}
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
 * lives in \`tools/world-cells.json\`: the names, the continents, who
 * borders whom, and the straight-sided cell each place is cut from.
 *
 * **The coasts are real and the inland borders are ours.** The coastlines
 * come from Natural Earth, which is public domain and asks for nothing at
 * all, not even credit. Each place is the land inside a cell we drew, so a
 * coast wanders and a border between two places runs in a line. That is how
 * the world looks and how the classic board looks.
 *
 * Forty-two places in six continents, the layout anybody who has played
 * that board already knows.
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
  viewBox: '${viewBox}',

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
