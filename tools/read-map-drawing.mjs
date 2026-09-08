import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Turn a drawing into a map. Plan task 5.11.
 *
 * NICK DRAWS THE WHOLE MAP: the coasts AND the borders inside them. Then
 * this reads it. Every piece of land the border lines cut out becomes a
 * place, and two places that came from the same line share it exactly.
 *
 * There is NOTHING about the real world in here. No countries, no
 * latitude, no matching one shape against another. That guesswork is what
 * six earlier goes all foundered on, and Nick put his finger on it: "you
 * seem determined to map this to the real world when it is not
 * necessary... Is the problem the inner borders? I can put them back into
 * an outline." It was, and that is the answer.
 *
 * Run it with:
 *   node tools/read-map-drawing.mjs <drawing.svg> <name> [into.ts]
 *
 * WHAT TO DRAW. Coasts as you already have them. Then, on a layer called
 * "borders", a line across the land wherever you want one. The line may
 * overshoot into the sea: only the part crossing land counts. A line that
 * does not cut land right across leaves that land in one piece.
 *
 * NAMING. Every piece comes out named after whichever place of the map
 * being replaced sits inside it, so redrawing the world keeps its names,
 * continents and bonuses. Anything left over is named "place 1", "place
 * 2" and so on, and is renamed in the editor at /editor.html.
 */

const WRITE_TO = 'src/maps/world.ts'

/** Pieces of land smaller than this many cells are left out. */
const TOO_SMALL_PIECE = Number(process.env['SMALLEST'] ?? 40)

/** A border line is drawn this many cells wide before it cuts. */
const LINE_WIDTH = Number(process.env['LINE'] ?? 1)

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


/** A point as a key, so two shapes can be seen to share it. */
const where = (point) => `${point[0].toFixed(6)},${point[1].toFixed(6)}`

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


/**
 * Nick: "Why can't you just keep the outline I gave you?" So it is kept,
 * exactly, and he edits it himself in Inkscape. Every closed shape in
 * the file is land: a traced coast band, a filled island, or a new shape
 * drawn with the pen. Groups and their transforms are followed, and
 * every kind of path command Inkscape writes is read.
 */
/**
 * Every shape in a drawing, with the layer it is on and its colour.
 *
 * Groups and their transforms are followed, so a shape comes back where
 * it looks on the page. Inkscape writes a layer as a group with a label,
 * and that label is carried down to everything inside it, which is how a
 * border line is told from a coast.
 */
function loadDrawing(file) {
  const text = readFileSync(file, 'utf8')
  const found = []
  const stack = [{ at: [1, 0, 0, 1, 0, 0], layer: null }]
  const tags = text.matchAll(/<(\/?)(g|path|polygon|polyline|line)\b([^>]*?)(\/?)>/g)
  const labelIn = (attributes) => {
    const label =
      /\binkscape:label="([^"]*)"/.exec(attributes) ??
      /\bid="([^"]*)"/.exec(attributes)

    return label === null ? null : label[1]
  }
  const colourIn = (attributes) => {
    const stroke = /\bstroke[:=]\s*"?([^";]*)/.exec(attributes)
    const style = /\bstyle="([^"]*)"/.exec(attributes)
    const inStyle =
      style === null ? null : /stroke:\s*([^;"]+)/.exec(style[1])

    return (inStyle?.[1] ?? stroke?.[1] ?? '').trim()
  }

  for (const [, closing, tag, attributes, selfClosing] of tags) {
    const top = stack[stack.length - 1]

    if (tag === 'g') {
      if (closing) {
        if (stack.length > 1) stack.pop()
      } else if (!selfClosing) {
        stack.push({
          at: multiplied(top.at, transformIn(attributes)),
          layer: labelIn(attributes) ?? top.layer,
        })
      }
      continue
    }

    const here = multiplied(top.at, transformIn(attributes))
    const apply = ([x, y]) => [
      here[0] * x + here[2] * y + here[4],
      here[1] * x + here[3] * y + here[5],
    ]
    const layer = labelIn(attributes) ?? top.layer
    const colour = colourIn(attributes)
    const add = (ring) => {
      if (ring.length >= 2) found.push({ ring: ring.map(apply), layer, colour })
    }

    if (tag === 'path') {
      const d = /\bd="([^"]*)"/.exec(attributes)

      if (d) {
        for (const ring of flattened(d[1])) add(ring)
      }
    } else if (tag === 'line') {
      const number = (name) => {
        const found = new RegExp(`\\b${name}="([-\\d.e]+)"`).exec(attributes)

        return found === null ? 0 : Number(found[1])
      }

      add([
        [number('x1'), number('y1')],
        [number('x2'), number('y2')],
      ])
    } else {
      const points = /\bpoints="([^"]*)"/.exec(attributes)

      if (points) {
        const numbers = points[1].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
        const ring = []

        for (let at = 0; at + 1 < numbers.length; at += 2) {
          ring.push([Number(numbers[at]), Number(numbers[at + 1])])
        }
        add(ring)
      }
    }
  }

  return found
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
    if (ring.length >= 2) rings.push(ring)
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


// ---------------------------------------------------------- the two layers

/**
 * The drawing, split into the coasts and the border lines.
 *
 * A border line is anything on a layer called "borders", or anything
 * drawn in red. Inkscape writes a layer as a group with a label on it,
 * so either way of working is read.
 */
function coastsAndBorders(file) {
  const drawn = loadDrawing(file)
  const coasts = []
  const borders = []

  for (const { ring, layer, colour } of drawn) {
    const isBorder =
      /border/i.test(layer ?? '') || /#?(f00|ff0000|red)/i.test(colour ?? '')

    ;(isBorder ? borders : coasts).push(ring)
  }

  return { coasts, borders }
}

// ------------------------------------------------------------ the cutting

/** Cells the border lines run through, so the land can be cut along them. */
function linesCut(borders, width, height) {
  const cut = new Uint8Array(width * height)
  const mark = (x, y) => {
    for (let dy = -LINE_WIDTH; dy <= LINE_WIDTH; dy += 1) {
      for (let dx = -LINE_WIDTH; dx <= LINE_WIDTH; dx += 1) {
        const at = y + dy
        const along = x + dx

        if (at >= 0 && at < height && along >= 0 && along < width) {
          cut[at * width + along] = 1
        }
      }
    }
  }

  for (const line of borders) {
    for (let at = 0; at + 1 < line.length; at += 1) {
      const [x1, y1] = line[at]
      const [x2, y2] = line[at + 1]
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1)

      for (let step = 0; step <= steps; step += 1) {
        mark(
          Math.round(x1 + ((x2 - x1) * step) / steps),
          Math.round(y1 + ((y2 - y1) * step) / steps),
        )
      }
    }
  }

  return cut
}

/**
 * Every piece of land the lines leave behind, then grown back over the
 * lines themselves.
 *
 * The lines are a cell or two wide, so cutting along them would leave a
 * gap between two places. Instead each cell of the line goes to whichever
 * piece is nearest, which closes the gap and makes the two pieces meet
 * exactly along it.
 */
function piecesOf(land, cut, width, height) {
  const standing = new Uint8Array(width * height)

  for (let cell = 0; cell < land.length; cell += 1) {
    standing[cell] = land[cell] === 1 && cut[cell] === 0 ? 1 : 0
  }

  const owner = new Int16Array(width * height).fill(-1)
  const seen = new Uint8Array(width * height)
  let count = 0

  for (let cell = 0; cell < standing.length; cell += 1) {
    if (standing[cell] === 0 || seen[cell] === 1) continue

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

        if (seen[next] === 0 && standing[next] === 1) {
          seen[next] = 1
          queue.push(next)
        }
      }
    }

    if (cells.length < TOO_SMALL_PIECE) continue

    for (const each of cells) owner[each] = count
    count += 1
  }

  // The cells under the lines go to the nearest piece.
  let edge = []

  for (let cell = 0; cell < owner.length; cell += 1) {
    if (owner[cell] >= 0) edge.push(cell)
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

        if (land[next] === 1 && owner[next] === -1) {
          owner[next] = owner[cell]
          spreading.push(next)
        }
      }
    }
    edge = spreading
  }

  return { owner, count }
}

// -------------------------------------------------------------- the names

/**
 * Name each piece after the place of the OLD map that sits inside it.
 *
 * Redrawing the world then keeps every name, continent and border list,
 * and only the shapes change. A piece with nobody inside it is "place 1",
 * "place 2" and so on, to be renamed in the editor.
 */
function namedFrom(pieces, replacing, stillJoined) {
  const old = replacing === null ? [] : replacing.territories
  const named = []
  let spare = 0

  for (const piece of pieces) {
    const sitting = old.filter(
      (each) =>
        !named.some((taken) => taken.id === each.id) &&
        insideRing([each.labelAt.x, each.labelAt.y], piece.corners),
    )
    const takes = sitting[0]

    if (sitting.length > 1) {
      stillJoined.push(sitting.map((each) => each.name).join(' + '))
    }

    if (takes === undefined) {
      spare += 1
      named.push({
        id: `place${spare}`,
        name: `Place ${spare}`,
        shortName: `P${spare}`,
        regionId: replacing?.regions[0]?.id ?? 'everywhere',
        borders: [],
        ...piece,
      })
      continue
    }

    named.push({
      id: takes.id,
      name: takes.name,
      shortName: takes.shortName,
      regionId: takes.regionId,
      borders: [],
      ...piece,
    })
  }

  return named
}

/** Who touches whom, from the shapes themselves. */
function bordersBetween(places, owner, width, height) {
  const touching = places.map(() => new Set())

  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const here = owner[y * width + x]

      if (here < 0) continue

      for (const next of [owner[y * width + x + 1], owner[(y + 1) * width + x]]) {
        if (next >= 0 && next !== here) {
          touching[here].add(next)
          touching[next].add(here)
        }
      }
    }
  }

  return touching
}

// ------------------------------------------------------------------- build

function main() {
  const [file, mapName, into, names] = process.argv.slice(2)

  if (file === undefined) {
    throw new Error(
      'Say which drawing to read:\n' +
        '  node tools/read-map-drawing.mjs <drawing.svg> <name> [into.ts] [names-from.ts]',
    )
  }

  const { coasts, borders } = coastsAndBorders(file)
  const everyPoint = [...coasts, ...borders].flat()
  const width = Math.ceil(Math.max(...everyPoint.map(([x]) => x))) + 3
  const height = Math.ceil(Math.max(...everyPoint.map(([, y]) => y))) + 3

  console.log(
    `${coasts.length} coast shapes, ${borders.length} border lines, ` +
      `${width} by ${height}`,
  )

  const land = landOf(painted(coasts, width, height), width, height)
  const { owner, count } = piecesOf(
    land,
    linesCut(borders, width, height),
    width,
    height,
  )

  console.log(`${count} pieces of land`)

  if (count === 0) {
    throw new Error('No land at all. Are the coasts closed shapes?')
  }

  // Each piece's outline, walked around its own cells so two neighbours
  // share their border point for point.
  const everyRing = new Map()
  const shapes = []

  for (let piece = 0; piece < count; piece += 1) {
    const rings = walkedAround(owner, piece, width, height)
      .filter((ring) => Math.abs(roomTaken(ring)) >= TOO_SMALL_PIECE)
      .sort((one, two) => Math.abs(roomTaken(two)) - Math.abs(roomTaken(one)))

    rings.forEach((ring, at) => everyRing.set(`${piece}/${at}`, ring))
    shapes.push(rings.length)
  }

  const thinner = simplifyTogether(everyRing, SIMPLIFY_TO)
  const tidy = (ring) =>
    ring
      .map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))])
      .filter(
        (point, at, all) =>
          at === 0 || point[0] !== all[at - 1][0] || point[1] !== all[at - 1][1],
      )
  const pieces = shapes.map((howMany, piece) => {
    const rings = []

    for (let at = 0; at < howMany; at += 1) {
      rings.push(tidy(thinner.get(`${piece}/${at}`)))
    }

    return {
      corners: rings[0],
      islands: rings.slice(1),
      labelAt: roomiestIn(rings[0]),
    }
  })

  const replacing = theOldMap(names ?? WRITE_TO)
  const stillJoined = []
  const places = namedFrom(pieces, replacing, stillJoined)
  const touching = bordersBetween(places, owner, width, height)

  places.forEach((place, at) => {
    place.borders = [...touching[at]]
      .map((other) => places[other].id)
      .sort()
  })

  const spare = places.filter((place) => place.id.startsWith('place')).length

  console.log(
    `${places.length} places, ${places.length - spare} of them named from ` +
      `the map they replace`,
  )

  // The useful warning: a piece holding two of the old places is a piece
  // a border line should have cut and did not. A line only cuts if it
  // goes RIGHT across, from sea to sea.
  if (stillJoined.length > 0) {
    console.log(
      `${stillJoined.length} pieces are still joined that used to be ` +
        `apart. Draw a line right across each of these, sea to sea:`,
    )
    for (const joined of stillJoined) {
      console.log(`  ${joined}`)
    }
  }

  writeFileSync(
    into ?? WRITE_TO,
    asTypeScript(places, mapName ?? 'World', replacing, frameFor(places)),
  )
  console.log(`wrote ${into ?? WRITE_TO}`)
}

/**
 * The map being replaced, read for its names, continents and bonuses.
 *
 * Read with a few patterns rather than imported, because this is a plain
 * script and the map is TypeScript. Only the names and the label points
 * are wanted, and the file is written in a shape that does not vary.
 */
function theOldMap(file) {
  let text = ''

  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }

  const territories = []
  const blocks = text.matchAll(
    /id: '([^']+)',\s*name: '([^']+)',\s*shortName: '([^']+)',\s*regionId: '([^']+)',[\s\S]*?labelAt: at\((-?[\d.]+), (-?[\d.]+)\)/g,
  )

  for (const [, id, name, shortName, regionId, x, y] of blocks) {
    territories.push({
      id,
      name,
      shortName,
      regionId,
      labelAt: { x: Number(x), y: Number(y) },
    })
  }

  const regions = []
  const found = text.matchAll(
    /id: '([^']+)',\s*name: '([^']+)',\s*bonus: (\d+),\s*outline: '([^']+)'/g,
  )

  for (const [, id, name, bonus, outline] of found) {
    regions.push({ id, name, bonus: Number(bonus), outline })
  }

  const named = /name: '([^']+)',\s*viewBox/.exec(text)

  if (territories.length === 0) {
    return null
  }

  return { id: 'world', name: named?.[1] ?? 'World', territories, regions }
}

function frameFor(places) {
  const rings = places.flatMap((place) => [place.corners, ...place.islands])
  const xs = rings.flatMap((ring) => ring.map(([x]) => x))
  const ys = rings.flatMap((ring) => ring.map(([, y]) => y))
  const edge = 12
  const halfName = (place) => (place.name.length * 10.5 * 0.5) / 2
  const left = Math.round(
    Math.min(...xs, ...places.map((p) => p.labelAt[0] - halfName(p))) - edge,
  )
  const top = Math.round(Math.min(...ys, ...places.map((p) => p.labelAt[1])) - edge)
  const right = Math.round(
    Math.max(...xs, ...places.map((p) => p.labelAt[0] + halfName(p))) + edge,
  )
  const bottom = Math.round(
    Math.max(...ys, ...places.map((p) => p.labelAt[1] + 30)) + edge,
  )

  return `${left} ${top} ${right - left} ${bottom - top}`
}

function asTypeScript(places, mapName, replacing, viewBox) {
  const regions =
    replacing?.regions ??
    [{ id: 'everywhere', name: 'Everywhere', bonus: 2, outline: '#7a6f5d' }]
  const blocks = places.map(
    (place) => `  {
    id: '${place.id}',
    name: '${place.name}',
    shortName: '${place.shortName}',
    regionId: '${place.regionId}',
    borders: [
${place.borders.map((each) => `      '${each}',`).join('\n')}
    ],
    corners: [
${asCorners(place.corners)}
    ],
    labelAt: at(${place.labelAt[0]}, ${place.labelAt[1]}),${
      place.islands.length > 0
        ? `\n    islands: [\n${place.islands
            .map((island) => `      [\n${asCorners(island).replace(/^/gm, '  ')}\n      ],`)
            .join('\n')}\n    ],`
        : ''
    }
  },`,
  )

  return `import type { GameMap, Point, TerritoryDefinition } from '../engine'
import { pathFrom } from './shapes'

/**
 * ${mapName}. Plan task 5.11.
 *
 * READ FROM A DRAWING by \`node tools/read-map-drawing.mjs\`. Every coast
 * and every border in it was drawn by hand, and nothing about the real
 * world came into it. Change it in the editor at \`/editor.html\`, or draw
 * it again and read it again.
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
  readonly islands?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>
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
  id: '${(replacing?.id ?? mapName).toLowerCase().replace(/[^a-z0-9]+/g, '')}',
  name: '${mapName}',
  viewBox: '${viewBox}',

  regions: [
${regions
  .map(
    (region) => `    {
      id: '${region.id}',
      name: '${region.name}',
      bonus: ${region.bonus},
      outline: '${region.outline}',
    },`,
  )
  .join('\n')}
  ],

  territories: PLACES.map(toTerritory),
}
`
}

main()
