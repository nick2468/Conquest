import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Draw the world map. Plan task 5.8.
 *
 * NICK'S COASTS, THE WORLD'S BORDERS.
 *
 * Nick: "Why can't you just keep the outline I gave you?" So this keeps
 * it. Every coast on the map is his drawing (`tools/data/nick-world-
 * outline.svg`), read from his file and used as it is. What his drawing
 * does not have is the borders inside the continents, and those come from
 * Natural Earth, public domain: "No permission is needed to use Natural
 * Earth. Crediting the authors is unnecessary." The data sits in
 * `tools/data`, so a build needs no internet.
 *
 * Six goes at this before it. Rectangles by hand: "far too blocky". A
 * tracing of somebody else's board: a licence Nick did not want. Real
 * coasts cut with straight cells: "too many straight lines". Real borders
 * on a squeezed globe, then on a rubber sheet with sixty pins, then on a
 * Mercator-like curve: "looks a bit odd", "very distorted and child
 * like", "still problematic". Then his own drawing on the Robinson
 * projection: "still looks all wrong to me." The lesson was that he had
 * already drawn the map he wanted.
 *
 * **How it goes together.** Each place is a group of real countries,
 * joined; where a place is part of ONE country, such as either half of
 * the United States, it is a group of that country's real provinces. Those
 * shapes are laid over Nick's drawing with pins, then every cell of his
 * land is given to the place whose border encloses it, and each place's
 * outline is walked around its cells. Two neighbours are walked around
 * the same cell edges, so they share their border point for point.
 *
 * **Joining countries works because the data shares its edges.** Where two
 * countries meet, both hold the SAME line, one running each way. So the
 * join is: throw away every edge that appears in both directions, because
 * that is a border inside the group, and stitch what is left into a ring.
 *
 * Run it with:  node tools/make-world-map.mjs
 */

const COUNTRIES = 'tools/data/ne-50m-countries.geojson'
const PROVINCES = 'tools/data/ne-50m-provinces.geojson'
const GROUPS = 'tools/world-groups.json'
const WRITE_TO = 'src/maps/world.ts'

/** Pieces smaller than this never make a place's own shape, in square degrees. */
const TOO_SMALL = 0.6

/** Islands smaller than this are not drawn at all, in square degrees. */
const TOO_SMALL_ISLAND = 0.12

// -------------------------------------------------------------- the data

function ringsOf(shape) {
  const pieces = shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates

  // The first ring of a piece is its outside. The rest are lakes.
  return pieces.map((piece) => piece[0])
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

function middleOf(ring) {
  const xs = ring.map(([x]) => x)
  const ys = ring.map(([, y]) => y)

  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ]
}

/**
 * The far east of Russia is west of the date line, so its longitude reads
 * as -170, which would put it beside Alaska. Read it as 190 instead.
 */
function acrossTheDateLine(ring) {
  return ring.map(([lon, lat]) => [lon < -100 ? lon + 360 : lon, lat])
}

/** Every country, by name, as a list of rings. */
function loadCountries() {
  const found = new Map()

  for (const feature of JSON.parse(readFileSync(COUNTRIES, 'utf8')).features) {
    found.set(
      feature.properties.NAME,
      feature.properties.NAME === 'Russia'
        ? ringsOf(feature.geometry).map(acrossTheDateLine)
        : ringsOf(feature.geometry),
    )
  }

  return found
}

/** Every province of the few countries a place ever splits. */
function loadProvinces() {
  const found = []

  for (const feature of JSON.parse(readFileSync(PROVINCES, 'utf8')).features) {
    found.push({
      country: feature.properties.admin,
      name: feature.properties.name,
      rings:
        feature.properties.admin === 'Russia'
          ? ringsOf(feature.geometry).map(acrossTheDateLine)
          : ringsOf(feature.geometry),
    })
  }

  return found
}

// ------------------------------------------------------------ the joining

const where = (point) => `${point[0].toFixed(6)},${point[1].toFixed(6)}`

/**
 * Join a group of shapes into one outline, or several if they are apart.
 *
 * Where two of them meet, both hold the same line, one running each way.
 * Any edge with its own reverse in the group is therefore a border INSIDE
 * the group, and goes. What is left is the outside, and it stitches into
 * rings by following each edge to whichever one starts where it ended.
 */
function joined(rings) {
  const edges = new Map()

  for (const ring of rings) {
    // A ring from the file repeats its first point at the end.
    const points =
      where(ring[0]) === where(ring[ring.length - 1]) ? ring.slice(0, -1) : ring

    for (let at = 0; at < points.length; at += 1) {
      const from = points[at]
      const to = points[(at + 1) % points.length]

      edges.set(`${where(from)}>${where(to)}`, [from, to])
    }
  }

  const outside = new Map()

  for (const [name, [from, to]] of edges) {
    if (!edges.has(`${where(to)}>${where(from)}`)) {
      const already = outside.get(where(from)) ?? []

      already.push([from, to])
      outside.set(where(from), already)
    }
  }

  const built = []

  while (outside.size > 0) {
    const first = outside.values().next().value
    let step = first[0]
    const ring = [step[0]]

    for (let guard = 0; guard < 200000; guard += 1) {
      const leaving = outside.get(where(step[0]))

      if (leaving !== undefined) {
        const at = leaving.indexOf(step)

        if (at >= 0) {
          leaving.splice(at, 1)
        }

        if (leaving.length === 0) {
          outside.delete(where(step[0]))
        }
      }

      const next = outside.get(where(step[1]))

      if (next === undefined || next.length === 0) {
        break
      }

      step = next[0]
      ring.push(step[0])
    }

    if (ring.length >= 3) {
      built.push(ring)
    }
  }

  return built.sort((one, two) => roomTaken(two) - roomTaken(one))
}

// ----------------------------------------------------------- simplifying

/**
 * How far a border may be moved when simplifying, in degrees.
 *
 * Real borders are drawn in enormous detail: joined up straight from the
 * data the map came to 18,511 corners, which is more than the game can
 * redraw comfortably and far more than an eye can see. This keeps the
 * shape of a coast and a border and drops the wobble between.
 */
const SIMPLIFY_TO = Number(process.env['SIMPLIFY'] ?? 1.6)

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

/** Ramer-Douglas-Peucker. */
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

/**
 * Round the corners off a line.
 *
 * Simplifying leaves a line of straight runs meeting at sharp corners,
 * which reads as jagged and cheap. The classic board is drawn with smooth
 * rounded coasts. So each corner is cut off: every straight run is
 * replaced by the points a quarter and three quarters of the way along
 * it (Chaikin's method). Done once it rounds, done twice it is a curve.
 * The two ends stay exactly where they were, which is what lets a shared
 * border stay shared: both sides round the identical run of points.
 */
function rounded(points, times = ROUND_TIMES) {
  let line = points

  for (let round = 0; round < times; round += 1) {
    if (line.length < 3) {
      return line
    }

    const out = [line[0]]

    for (let at = 0; at + 1 < line.length; at += 1) {
      const [fromX, fromY] = line[at]
      const [toX, toY] = line[at + 1]

      out.push([fromX * 0.75 + toX * 0.25, fromY * 0.75 + toY * 0.25])
      out.push([fromX * 0.25 + toX * 0.75, fromY * 0.25 + toY * 0.75])
    }
    out.push(line[line.length - 1])
    line = out
  }

  // The rounding adds points along nearly straight runs that add nothing
  // to the shape. A light second pass drops those.
  return simplified(line, SIMPLIFY_TO / 6)
}

function roundedRing(ring, times = ROUND_TIMES) {
  const line = rounded([...ring, ring[0]], times)

  line.pop()
  return line
}

/** How many times the corners are cut. Once rounds, twice curves. */
const ROUND_TIMES = Number(process.env['ROUND'] ?? 2)

/**
 * Simplify each shared BORDER once, not each place twice.
 *
 * Simplifying two neighbours on their own simplifies the border between
 * them twice, differently, and the two stop meeting. So each outline is
 * cut into stretches that run between junctions, each stretch is
 * simplified ONCE, and the outlines are built again from those. Both sides
 * then get the identical line, because it IS the identical line.
 *
 * This works here and did not on an earlier traced map, for one reason:
 * these outlines come from data that shares its points exactly, so a
 * shared border really is the same run of points on both sides.
 */
function simplifyTogether(outlines, tolerance) {
  const belongsTo = new Map()

  for (const [name, ring] of outlines) {
    for (const point of ring) {
      const already = belongsTo.get(where(point)) ?? new Set()

      already.add(name)
      belongsTo.set(where(point), already)
    }
  }

  const owner = (point) =>
    [...(belongsTo.get(where(point)) ?? [])].sort().join('|')

  const done = new Map()
  const out = new Map()

  for (const [name, ring] of outlines) {
    const owners = ring.map(owner)
    const count = ring.length
    const junctions = []

    for (let at = 0; at < count; at += 1) {
      if (
        owners[at] !== owners[(at + count - 1) % count] ||
        owners[at] !== owners[(at + 1) % count]
      ) {
        junctions.push(at)
      }
    }

    // Nothing shared with anybody: an island, simplified whole.
    if (junctions.length < 2) {
      out.set(name, roundedRing(simplifiedRing(ring, tolerance)))
      continue
    }

    const rebuilt = []

    for (let step = 0; step < junctions.length; step += 1) {
      const from = junctions[step]
      const to = junctions[(step + 1) % junctions.length]
      const run = [ring[from]]

      for (let at = (from + 1) % count; ; at = (at + 1) % count) {
        run.push(ring[at])
        if (at === to) break
      }

      const forwards = run.map(where).join(' ')
      const backwards = [...run].reverse().map(where).join(' ')
      const key = forwards < backwards ? forwards : backwards

      if (!done.has(key)) {
        done.set(key, rounded(simplified(run, tolerance)))
      }

      const kept = done.get(key)
      const sameWayRound = where(kept[0]) === where(run[0])
      const inOrder = sameWayRound ? kept : [...kept].reverse()

      for (const point of inOrder.slice(0, -1)) {
        rebuilt.push(point)
      }
    }

    out.set(
      name,
      rebuilt.filter(
        (point, at) => at === 0 || where(point) !== where(rebuilt[at - 1]),
      ),
    )
  }

  return out
}

// ------------------------------------------- Nick's outline, and the sheet

/** Nick's drawing of the world, traced. Every coast on the map is his. */
const OUTLINE = 'tools/data/nick-world-outline.svg'

/**
 * Nick: "Why can't you just keep the outline I gave you?" So it is kept,
 * exactly, and he edits it himself in Inkscape. Every closed shape in
 * the file is land: a traced coast band, a filled island, or a new shape
 * drawn with the pen. Groups and their transforms are followed, and
 * every kind of path command Inkscape writes is read.
 */
function loadOutline() {
  const text = readFileSync(OUTLINE, 'utf8')
  const rings = []
  const stack = [[1, 0, 0, 1, 0, 0]]
  const tags = text.matchAll(/<(\/?)(g|path|polygon)\b([^>]*?)(\/?)>/g)

  for (const [, closing, tag, attributes, selfClosing] of tags) {
    if (tag === 'g') {
      if (closing) {
        stack.pop()
      } else if (!selfClosing) {
        stack.push(multiplied(stack[stack.length - 1], transformIn(attributes)))
      }
      continue
    }

    const here = multiplied(stack[stack.length - 1], transformIn(attributes))
    const apply = ([x, y]) => [
      here[0] * x + here[2] * y + here[4],
      here[1] * x + here[3] * y + here[5],
    ]

    if (tag === 'path') {
      const d = /\bd="([^"]*)"/.exec(attributes)

      if (d) {
        for (const ring of flattened(d[1])) {
          rings.push(ring.map(apply))
        }
      }
    } else {
      const points = /\bpoints="([^"]*)"/.exec(attributes)

      if (points) {
        const numbers = points[1].match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number)
        const ring = []

        for (let at = 0; at + 1 < numbers.length; at += 2) {
          ring.push(apply([numbers[at], numbers[at + 1]]))
        }
        rings.push(ring)
      }
    }
  }

  return rings.filter((ring) => ring.length >= 3)
}

/** An SVG transform attribute as a matrix [a, b, c, d, e, f]. */
function transformIn(attributes) {
  const found = /\btransform="([^"]*)"/.exec(attributes)
  let matrix = [1, 0, 0, 1, 0, 0]

  if (!found) return matrix

  for (const [, kind, inside] of found[1].matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = inside.match(/-?\d*\.?\d+(?:e-?\d+)?/g).map(Number)
    let next = [1, 0, 0, 1, 0, 0]

    if (kind === 'translate') next = [1, 0, 0, 1, n[0], n[1] ?? 0]
    else if (kind === 'scale') next = [n[0], 0, 0, n[1] ?? n[0], 0, 0]
    else if (kind === 'matrix') next = n
    else if (kind === 'rotate') {
      const angle = (n[0] * Math.PI) / 180

      next = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]
    }
    matrix = multiplied(matrix, next)
  }

  return matrix
}

function multiplied([a, b, c, d, e, f], [a2, b2, c2, d2, e2, f2]) {
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ]
}

/**
 * An SVG path, as rings of points. Every command is read: moves, lines,
 * horizontals, verticals, cubic and quadratic curves and their smooth
 * forms, and arcs. A curve is cut into four straight pieces; an arc into
 * one, which is enough for a coastline nobody draws with arcs.
 */
function flattened(path) {
  const tokens = path.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const rings = []
  let ring = []
  let now = [0, 0]
  let start = [0, 0]
  let lastControl = null
  let command = 'M'
  let at = 0
  const next = () => Number(tokens[at++])
  const finish = () => {
    if (ring.length >= 3) rings.push(ring)
    ring = []
  }
  const curveTo = (x1, y1, x2, y2, x, y) => {
    const [x0, y0] = now

    for (const t of [0.25, 0.5, 0.75, 1]) {
      const u = 1 - t

      ring.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ])
    }
    now = [x, y]
    lastControl = [x2, y2]
  }

  while (at < tokens.length) {
    if (/[A-Za-z]/.test(tokens[at])) {
      command = tokens[at++]
    }

    const relative = command === command.toLowerCase()
    const from = relative ? now : [0, 0]
    const upper = command.toUpperCase()

    if (upper === 'Z') {
      finish()
      now = start
      continue
    }
    if (upper === 'M') {
      finish()
      now = [from[0] + next(), from[1] + next()]
      start = now
      ring = [now]
      command = relative ? 'l' : 'L'
    } else if (upper === 'L') {
      now = [from[0] + next(), from[1] + next()]
      ring.push(now)
    } else if (upper === 'H') {
      now = [from[0] + next(), now[1]]
      ring.push(now)
    } else if (upper === 'V') {
      now = [now[0], from[1] + next()]
      ring.push(now)
    } else if (upper === 'C') {
      curveTo(from[0] + next(), from[1] + next(), from[0] + next(), from[1] + next(), from[0] + next(), from[1] + next())
    } else if (upper === 'S') {
      const mirror = lastControl ? [2 * now[0] - lastControl[0], 2 * now[1] - lastControl[1]] : now

      curveTo(mirror[0], mirror[1], from[0] + next(), from[1] + next(), from[0] + next(), from[1] + next())
    } else if (upper === 'Q' || upper === 'T') {
      let qx
      let qy

      if (upper === 'Q') {
        qx = from[0] + next()
        qy = from[1] + next()
      } else {
        ;[qx, qy] = lastControl ? [2 * now[0] - lastControl[0], 2 * now[1] - lastControl[1]] : now
      }
      const x = from[0] + next()
      const y = from[1] + next()
      const [x0, y0] = now

      curveTo(
        x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0),
        x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y),
        x, y,
      )
      lastControl = [qx, qy]
    } else if (upper === 'A') {
      next(); next(); next(); next(); next()
      now = [from[0] + next(), from[1] + next()]
      ring.push(now)
    }
    if (upper !== 'C' && upper !== 'S' && upper !== 'Q' && upper !== 'T') lastControl = null
  }
  finish()

  return rings
}

/**
 * Where the real borders go on Nick's drawing.
 *
 * His drawing has every coast and no borders. Natural Earth has both, on
 * a globe. So the globe is laid over his drawing on a SHEET: a plain
 * world map, bent by a grid of handles until the real coastlines sit on
 * top of his drawn ones.
 *
 * Nothing here is typed by eye. `node tools/fit-world-sheet.mjs` works
 * the sheet out by sliding the handles about, and writes it into
 * `tools/world-groups.json`. Sixty pins typed by hand came before it,
 * and they put Kamchatka out in the Pacific and drew Japan on Korea.
 *
 * The sheet only has to be roughly right. A border that lands a little
 * off the coast does no harm, because every place is finally cut out of
 * HIS land, not the sheet's.
 */
const EVERY_FIVE_DEGREES = [
  // [how wide, how far up] at 0, 5, 10 ... 90 degrees from the equator,
  // from the Robinson projection: the world map on a classroom wall.
  [1, 0], [0.9986, 0.062], [0.9954, 0.124], [0.99, 0.186], [0.9822, 0.248],
  [0.973, 0.31], [0.96, 0.372], [0.9427, 0.434], [0.9216, 0.4958], [0.8962, 0.5571],
  [0.8679, 0.6176], [0.835, 0.6769], [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435],
  [0.6732, 0.8936], [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1],
]

function robinson(lat) {
  const away = Math.min(Math.abs(lat), 90) / 5
  const step = Math.min(Math.floor(away), 17)
  const between = away - step
  const [wideFrom, upFrom] = EVERY_FIVE_DEGREES[step]
  const [wideTo, upTo] = EVERY_FIVE_DEGREES[step + 1]
  const up = upFrom + between * (upTo - upFrom)

  return [wideFrom + between * (wideTo - wideFrom), lat < 0 ? -up : up]
}

function sheetFrom(sheet) {
  if (sheet === undefined) {
    throw new Error('No sheet yet. Run: node tools/fit-world-sheet.mjs')
  }

  const { base, handles, across, down, wide, high } = sheet
  const acrossStep = wide / across
  const downStep = high / down

  return ([lon, lat]) => {
    const [wideHere, up] = robinson(lat)
    const x = (wideHere * lon - base.lon0) * base.across
    const y = (base.lat0 - up * 100) * base.down

    // A point takes a blend of the four handles around it, so the
    // bending is smooth.
    const column = Math.min(Math.max(x / acrossStep, 0), across - 0.0001)
    const row = Math.min(Math.max(y / downStep, 0), down - 0.0001)
    const left = Math.floor(column)
    const top = Math.floor(row)
    const alongX = column - left
    const alongY = row - top
    let dx = 0
    let dy = 0

    for (const [cx, cy, share] of [
      [left, top, (1 - alongX) * (1 - alongY)],
      [left + 1, top, alongX * (1 - alongY)],
      [left, top + 1, (1 - alongX) * alongY],
      [left + 1, top + 1, alongX * alongY],
    ]) {
      const handle = handles[cy * (across + 1) + cx]

      dx += handle[0] * share
      dy += handle[1] * share
    }

    return [x + dx, y + dy]
  }
}

// ------------------------------------------------------------- the cutting

/**
 * Every place is cut out of Nick's land, one cell at a time.
 *
 * The drawing is laid on a grid of cells, one to a unit. A cell is LAND if
 * the sea cannot reach it from the corner of the page, which is what makes
 * the inside of a coastline count as land. Each land cell is then given to
 * the place whose real border encloses it, or, along the coast where the
 * sheet is a little off, to the nearest place, however far. New Zealand
 * goes to Eastern Australia because that is the nearest.
 *
 * Then the edge of each place's cells is walked to make its outline. Two
 * neighbours' outlines are built from the SAME cell edges, so they share
 * their border point for point, which is what every rule of a map needs.
 */

/** Rings smaller than this many cells are noise from the tracing. */
const TOO_FEW_CELLS = 4

function painted(rings, width, height) {
  // Even-odd: a cell is inside where an odd number of rings cover it.
  // That is how the thin bands of Nick's tracing come out as lines.
  const grid = new Uint8Array(width * height)

  for (const ring of rings) {
    let top = Infinity
    let bottom = -Infinity

    for (const [, y] of ring) {
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }

    for (let row = Math.max(0, Math.floor(top)); row <= Math.min(height - 1, Math.ceil(bottom)); row += 1) {
      const y = row + 0.5
      const crossings = []

      for (let at = 0; at < ring.length; at += 1) {
        const [x1, y1] = ring[at]
        const [x2, y2] = ring[(at + 1) % ring.length]

        if (y1 > y !== y2 > y) {
          crossings.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
        }
      }
      crossings.sort((a, b) => a - b)

      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.round(crossings[k]))
        const to = Math.min(width - 1, Math.round(crossings[k + 1]) - 1)

        for (let column = from; column <= to; column += 1) {
          grid[row * width + column] ^= 1
        }
      }
    }
  }

  return grid
}

/** A gap in a coastline up to twice this many cells wide is closed. */
const GAP = Number(process.env['GAP'] ?? 2)

function grown(grid, width, height, by, value) {
  // Every cell within `by` of a set cell becomes `value` (1 to grow the
  // set, 0 to shrink it: then it is the unset cells that spread).
  const out = Uint8Array.from(grid)

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (grid[row * width + column] !== value) continue

      for (let dy = -by; dy <= by; dy += 1) {
        for (let dx = -by; dx <= by; dx += 1) {
          const y = row + dy
          const x = column + dx

          if (y >= 0 && y < height && x >= 0 && x < width) {
            out[y * width + x] = value
          }
        }
      }
    }
  }

  return out
}

function landOf(lines, width, height) {
  // The lines, thicker, so a gap in the drawing does not let the sea in.
  // Nick: "there are some coast gaps I can see." The land is shrunk back
  // by the same amount afterwards, so the coast stays where he drew it.
  const thick = grown(lines, width, height, GAP, 1)

  // The sea floods in from the corner of the page.
  const sea = new Uint8Array(width * height)
  const queue = [0]

  sea[0] = 1
  while (queue.length > 0) {
    const cell = queue.pop()
    const x = cell % width
    const y = (cell - x) / width

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

      const next = ny * width + nx

      if (sea[next] === 0 && thick[next] === 0) {
        sea[next] = 1
        queue.push(next)
      }
    }
  }

  const land = new Uint8Array(width * height)

  for (let cell = 0; cell < land.length; cell += 1) {
    land[cell] = sea[cell] === 0 ? 1 : 0
  }

  return grown(land, width, height, GAP, 0)
}

const NOBODY = -1

/**
 * A patch smaller than this many cells is a scrap, and joins the place
 * around it. A place's LAST patch is never taken away.
 */
const A_SCRAP = Number(process.env['SCRAP'] ?? 90)

function givenOut(land, places, width, height) {
  const owner = new Int16Array(width * height).fill(NOBODY)

  // First, every land cell inside a place's real border.
  places.forEach((place, index) => {
    const inside = painted(place.onTheSheet, width, height)

    for (let cell = 0; cell < owner.length; cell += 1) {
      if (inside[cell] === 1 && land[cell] === 1 && owner[cell] === NOBODY) {
        owner[cell] = index
      }
    }
  })

  // A place whose shape misses the drawn land altogether takes the
  // nearest island nobody has claimed. Iceland is small and the sheet is
  // rough, so its shape sat just off Nick's Iceland and it came out with
  // nothing at all.
  const homeless = places
    .map((place, index) => index)
    .filter((index) => !owner.includes(index))

  if (homeless.length > 0) {
    const free = patchesOf(owner, land, width, height, NOBODY)

    for (const index of homeless) {
      const everyPoint = places[index].onTheSheet.flat()
      const middle = [
        everyPoint.reduce((sum, [x]) => sum + x, 0) / everyPoint.length,
        everyPoint.reduce((sum, [, y]) => sum + y, 0) / everyPoint.length,
      ]
      let best = null
      let closest = Infinity

      for (const patch of free) {
        if (patch.taken === true) continue
        // Not a speck. Iceland's shape sat nearer a five-cell rock than
        // it did to Nick's Iceland.
        if (patch.cells.length < A_SCRAP) continue

        for (const cell of patch.cells) {
          const x = cell % width
          const y = (cell - x) / width
          const away = (x - middle[0]) ** 2 + (y - middle[1]) ** 2

          if (away < closest) {
            closest = away
            best = patch
          }
        }
      }

      if (best === null) {
        throw new Error(`"${places[index].id}" found no free land at all.`)
      }

      best.taken = true
      for (const cell of best.cells) owner[cell] = index
    }
  }

  // Then every other cell of land goes to the NEAREST place. Nick, of the
  // land nobody owned: "just grow the nearest country to cover them up."
  //
  // The spreading goes over the sea as well as the land, or it could
  // never reach an island. New Zealand touches nothing and no real
  // country covers it, so a spread that walked only on land left it
  // owned by nobody, which drew it as nothing at all.
  const reached = new Int16Array(width * height).fill(NOBODY)
  let edge = []

  for (let cell = 0; cell < owner.length; cell += 1) {
    if (owner[cell] >= 0) {
      reached[cell] = owner[cell]
      edge.push(cell)
    }
  }

  while (edge.length > 0) {
    const spreading = []

    for (const cell of edge) {
      const x = cell % width
      const y = (cell - x) / width

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy

        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

        const next = ny * width + nx

        if (reached[next] === NOBODY) {
          reached[next] = reached[cell]
          spreading.push(next)
        }
      }
    }
    edge = spreading
  }

  for (let cell = 0; cell < owner.length; cell += 1) {
    if (land[cell] === 1) owner[cell] = reached[cell]
  }

  // A cell surrounded by another owner goes over to it. Twice over, this
  // takes the pimples and pinholes off every border.
  for (let pass = 0; pass < 2; pass += 1) {
    const before = Int16Array.from(owner)

    for (let row = 1; row < height - 1; row += 1) {
      for (let column = 1; column < width - 1; column += 1) {
        const cell = row * width + column

        if (land[cell] === 0) continue

        const votes = new Map()

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const near = before[(row + dy) * width + column + dx]

            if (near !== NOBODY) votes.set(near, (votes.get(near) ?? 0) + 1)
          }
        }
        for (const [who, count] of votes) {
          if (count >= 6 && who !== before[cell]) owner[cell] = who
        }
      }
    }
  }

  tidiedAway(owner, land, places.length, width, height)

  if (process.env['SHOW'] !== undefined) {
    const count = new Array(places.length).fill(0)

    for (const who of owner) if (who >= 0) count[who] += 1
    places.forEach((place, at) => {
      if (count[at] < 200) console.log(`  small: ${place.id} ${count[at]} cells`)
    })
  }

  return owner
}

/** Every run of land cells with the same owner, joined side by side. */
function patchesOf(owner, land, width, height, only) {
  const seen = new Uint8Array(width * height)
  const patches = []

  for (let cell = 0; cell < owner.length; cell += 1) {
    if (land[cell] === 0 || seen[cell] === 1) continue
    if (only !== undefined && owner[cell] !== only) continue

    const cells = []
    const queue = [cell]

    seen[cell] = 1
    while (queue.length > 0) {
      const here = queue.pop()
      const x = here % width
      const y = (here - x) / width

      cells.push(here)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy

        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

        const next = ny * width + nx

        if (seen[next] === 0 && land[next] === 1 && owner[next] === owner[here]) {
          seen[next] = 1
          queue.push(next)
        }
      }
    }
    patches.push({ owner: owner[cell], cells })
  }

  return patches
}

/**
 * Scraps join the place around them.
 *
 * The sheet is a rough fit, so a place's border sometimes lands a few
 * cells over a neighbour's coast and takes a crumb with it. Nick: "is
 * that Switzerland in the middle of europe?" It was a crumb of Western
 * Europe left in the Alps. So any patch under A_SCRAP cells joins
 * whichever place shares the most edge with it. A place's last patch is
 * never taken, or a place could vanish.
 */
function tidiedAway(owner, land, howManyPlaces, width, height) {
  for (let pass = 0; pass < 3; pass += 1) {
    const patchOf = new Int32Array(width * height).fill(-1)
    const patches = []

    for (let cell = 0; cell < owner.length; cell += 1) {
      if (land[cell] === 0 || owner[cell] === NOBODY || patchOf[cell] >= 0) continue

      const which = patches.length
      const cells = []
      const queue = [cell]

      patchOf[cell] = which
      while (queue.length > 0) {
        const here = queue.pop()
        const x = here % width
        const y = (here - x) / width

        cells.push(here)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy

          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

          const next = ny * width + nx

          if (patchOf[next] === -1 && land[next] === 1 && owner[next] === owner[here]) {
            patchOf[next] = which
            queue.push(next)
          }
        }
      }
      patches.push({ owner: owner[cell], cells })
    }

    const biggest = new Array(howManyPlaces).fill(0)

    for (const patch of patches) {
      biggest[patch.owner] = Math.max(biggest[patch.owner], patch.cells.length)
    }

    let tidied = 0

    for (const patch of patches) {
      if (patch.cells.length >= A_SCRAP) continue
      if (patch.cells.length === biggest[patch.owner]) continue

      const shares = new Map()

      for (const cell of patch.cells) {
        const x = cell % width
        const y = (cell - x) / width

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy

          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue

          const near = owner[ny * width + nx]

          if (land[ny * width + nx] === 1 && near !== NOBODY && near !== patch.owner) {
            shares.set(near, (shares.get(near) ?? 0) + 1)
          }
        }
      }
      if (shares.size === 0) continue

      let takes = NOBODY
      let most = 0

      for (const [who, count] of shares) {
        if (count > most) {
          most = count
          takes = who
        }
      }
      for (const cell of patch.cells) owner[cell] = takes
      tidied += 1
    }

    if (tidied === 0) return
  }
}

/** The outline of every separate patch of one owner's cells. */
function walkedAround(owner, who, width, height) {
  const leaving = new Map()
  const add = (from, to) => {
    const key = `${from[0]},${from[1]}`

    leaving.set(key, [...(leaving.get(key) ?? []), to])
  }

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      if (owner[row * width + column] !== who) continue

      const mine = (x, y) =>
        x >= 0 && y >= 0 && x < width && y < height && owner[y * width + x] === who

      // Clockwise around the cell, so the land is always on the right.
      if (!mine(column, row - 1)) add([column, row], [column + 1, row])
      if (!mine(column + 1, row)) add([column + 1, row], [column + 1, row + 1])
      if (!mine(column, row + 1)) add([column + 1, row + 1], [column, row + 1])
      if (!mine(column - 1, row)) add([column, row + 1], [column, row])
    }
  }

  const rings = []

  while (leaving.size > 0) {
    const [firstKey, firstOut] = leaving.entries().next().value
    let now = firstKey.split(',').map(Number)
    let heading = [0, 0]
    const ring = []

    while (true) {
      const key = `${now[0]},${now[1]}`
      const outs = leaving.get(key)

      if (outs === undefined) break

      // At a pinch, where two patches of the same owner touch at a
      // corner, turn right, which keeps to this patch.
      let pick = 0

      if (outs.length > 1) {
        let bestTurn = -Infinity

        outs.forEach((to, at) => {
          const turn = heading[0] * (to[1] - now[1]) - heading[1] * (to[0] - now[0])

          if (turn > bestTurn) {
            bestTurn = turn
            pick = at
          }
        })
      }

      const to = outs[pick]

      outs.splice(pick, 1)
      if (outs.length === 0) leaving.delete(key)
      ring.push(now)
      heading = [to[0] - now[0], to[1] - now[1]]
      now = to
      if (now[0] === firstOut[0] && now[1] === firstOut[1] && ring.length > 0 && key === firstKey) {
        // Back where the first step began.
      }
      if (`${now[0]},${now[1]}` === firstKey) break
    }

    if (ring.length >= 4) rings.push(ring)
  }

  return rings
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
 * lands in the gap and the name would sit on the sea.
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

/**
 * Which place a province belongs to.
 *
 * Written as a RULE rather than a list of eighty-five names. The border
 * that comes out still follows real provinces, so it wanders the way a real
 * border does. Only which side of the line each province falls on is ours.
 */
function placeForProvince(rules, province) {
  const [lon, lat] = middleOf(
    province.rings.reduce((biggest, ring) =>
      roomTaken(ring) > roomTaken(biggest) ? ring : biggest,
    ),
  )

  for (const rule of rules[province.country] ?? []) {
    if (rule.named !== undefined) {
      if (rule.named.includes(province.name)) {
        return rule.place
      }

      continue
    }

    const fits =
      (rule.westOf === undefined || lon < rule.westOf) &&
      (rule.eastOf === undefined || lon >= rule.eastOf) &&
      (rule.northOf === undefined || lat >= rule.northOf) &&
      (rule.southOf === undefined || lat < rule.southOf)

    if (fits) {
      return rule.place
    }
  }

  return null
}

function main() {
  const meta = JSON.parse(readFileSync(GROUPS, 'utf8'))
  const countries = loadCountries()
  const provinces = loadProvinces()
  const sheet = sheetFrom(meta.sheet)

  // Every province, sorted into the place it belongs to.
  const provincesFor = new Map()
  const homeless = []

  for (const province of provinces) {
    const place = placeForProvince(meta.provinceRules, province)

    if (place === null) {
      homeless.push(`${province.country}/${province.name}`)
      continue
    }

    provincesFor.set(place, [...(provincesFor.get(place) ?? []), province])
  }

  if (homeless.length > 0) {
    console.log(`provinces left out: ${homeless.length}`)
  }

  // Each place's real shape, laid on the sheet.
  const built = []
  const unknown = []
  const overseas = []

  for (const place of meta.places) {
    const rings = []

    for (const name of place.countries ?? []) {
      const found = countries.get(name)

      if (found === undefined) {
        unknown.push(`${place.id}: ${name}`)
        continue
      }

      rings.push(...found)
    }

    for (const province of provincesFor.get(place.id) ?? []) {
      rings.push(...province.rings)
    }

    // Out with the overseas territories. Natural Earth's "France" holds
    // French Guiana in South America and Reunion in the Indian Ocean, and
    // its "Spain" holds the Canary Islands off Africa. Nick: "for western
    // europe parts of it are scattered across north africa and even to
    // south america." A place may say the corner of the world it lives
    // in, and anything outside that is somebody else's problem.
    const homeGround = place.livesIn

    if (homeGround !== undefined) {
      const [west, south, east, north] = homeGround
      const away = rings.filter((ring) => {
        const [lon, lat] = middleOf(ring)

        return lon < west || lon > east || lat < south || lat > north
      })

      for (const ring of away) {
        rings.splice(rings.indexOf(ring), 1)
      }

      if (away.length > 0) {
        overseas.push(`${place.id}(${away.length})`)
      }
    }

    if (rings.length === 0) {
      throw new Error(`"${place.id}" is made of nothing.`)
    }

    const onTheSheet = joined(rings.filter((ring) => roomTaken(ring) >= TOO_SMALL_ISLAND)).map(
      (ring) => simplifiedRing(ring, 0.1).map(sheet),
    )

    built.push({ ...place, onTheSheet })
  }

  if (unknown.length > 0) {
    throw new Error(`No such country:\n  ${unknown.join('\n  ')}`)
  }

  if (overseas.length > 0) {
    console.log(`overseas pieces left out: ${overseas.join(' ')}`)
  }

  // Nick's drawing, as land.
  const outline = loadOutline()
  const width = Math.ceil(Math.max(...outline.flatMap((ring) => ring.map(([x]) => x)))) + 3
  const height = Math.ceil(Math.max(...outline.flatMap((ring) => ring.map(([, y]) => y)))) + 3
  const land = landOf(painted(outline, width, height), width, height)

  // A picture of how the sheet fits, for the person tuning the pins.
  mkdirSync('public/scratch', { recursive: true })
  writeFileSync(
    'public/scratch/fit-check.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}" style="background:#fff">\n` +
      outline.map((ring) => `<path d="M ${ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z" fill="none" stroke="#000" stroke-width="0.5"/>`).join('\n') +
      built.flatMap((place) => place.onTheSheet.map((ring) => `<path d="M ${ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z" fill="none" stroke="#e00" stroke-width="0.6"/>`)).join('\n') +
      `\n</svg>\n`,
  )

  // Cut every place out of the land.
  const owner = givenOut(land, built, width, height)
  const everyRing = new Map()

  built.forEach((place, index) => {
    const rings = walkedAround(owner, index, width, height)
      .filter((ring) => Math.abs(roomTaken(ring)) >= TOO_FEW_CELLS)
      .sort((a, b) => Math.abs(roomTaken(b)) - Math.abs(roomTaken(a)))

    if (rings.length === 0) {
      throw new Error(`"${place.id}" got no land at all. Run: node tools/fit-world-sheet.mjs`)
    }

    rings.forEach((ring, at) => everyRing.set(`${place.id}/${at}`, ring))
    place.pieces = rings.length
  })

  // Every ring at once, so a shared border is simplified once, then
  // rounded, because cells have square corners and coasts do not.
  const thinner = simplifyTogether(everyRing, SIMPLIFY_TO)
  const tidy = (ring) =>
    ring
      .map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))])
      .filter((point, at, all) => at === 0 || point[0] !== all[at - 1][0] || point[1] !== all[at - 1][1])

  for (const place of built) {
    const rings = []

    for (let at = 0; at < place.pieces; at += 1) {
      rings.push(tidy(thinner.get(`${place.id}/${at}`)))
    }
    place.corners = rings[0]
    place.islands = rings.slice(1)
    place.labelAt = roomiestIn(place.corners)
  }

  const several = built.filter((place) => place.pieces > 1)

  if (several.length > 0) {
    console.log(
      'in several pieces, the rest drawn as islands: ' +
        several.map((place) => `${place.id}(${place.pieces})`).join(' '),
    )
  }

  console.log(
    `places: ${built.length}, corners: ` +
      built.reduce((sum, place) => sum + place.corners.length, 0) +
      `, island corners: ` +
      built.reduce((sum, place) => sum + place.islands.reduce((n, i) => n + i.length, 0), 0),
  )

  const allRings = built.flatMap((place) => [place.corners, ...place.islands])
  const xs = allRings.flatMap((ring) => ring.map(([x]) => x))
  const ys = allRings.flatMap((ring) => ring.map(([, y]) => y))
  const edge = 12
  // A name hangs below its count and spreads either side of it, about
  // half the font size per letter. The frame reaches past the name, not
  // just past the coast, or "Eastern Australia" loses its tail.
  const halfName = (place) => (place.name.length * 10.5 * 0.5) / 2
  const nameRoom = 30
  const left = Math.round(
    Math.min(...xs, ...built.map((p) => p.labelAt[0] - halfName(p))) - edge,
  )
  const top = Math.round(Math.min(...ys, ...built.map((p) => p.labelAt[1])) - edge)
  const right = Math.round(
    Math.max(...xs, ...built.map((p) => p.labelAt[0] + halfName(p))) + edge,
  )
  const bottom = Math.round(
    Math.max(...ys, ...built.map((p) => p.labelAt[1] + nameRoom)) + edge,
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
    }${
      place.islands.length > 0
        ? `\n    islands: [\n${place.islands
            .map((island) => `      [\n${asCorners(island).replace(/^/gm, '  ')}\n      ],`)
            .join('\n')}\n    ],`
        : ''
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
 * lives in \`tools/world-groups.json\`: the names, the continents, who
 * borders whom, and which real countries each place is made of.
 *
 * **Every border here is a real border.** Each place is a group of real
 * countries joined together, so the line between Peru and Brazil in the
 * game is the line between Peru and Brazil in the world. Where a place is
 * only part of a country, such as either half of the United States, it is
 * a group of that country's real provinces instead.
 *
 * The shapes come from Natural Earth, which is public domain and asks for
 * nothing at all, not even credit.
 *
 * Forty-two places in six continents, the layout anybody who has played
 * the classic board already knows.
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
  /** The place's other islands, drawn with it. Its shape is the biggest. */
  readonly islands?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>
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
    ...(place.islands ? { islands: place.islands.map(pathFrom) } : {}),
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
