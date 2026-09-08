import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Work out where the real world sits on Nick's drawing. Plan task 5.8.
 *
 * The map's coasts are Nick's own drawing and its borders are real ones,
 * so something has to say where a real place lands in his picture. That
 * used to be sixty pins I typed in by eye, and Nick was right to lose
 * patience with it: I put Kamchatka nine hundred units east, out in the
 * Pacific, and Japan was drawn on top of Korea.
 *
 * So this works it out instead. It lays every real coastline on his
 * drawing and slides a grid of handles about until the two agree as well
 * as they can. Nothing is typed by eye. Run it again whenever he redraws.
 *
 *   node tools/fit-world-sheet.mjs
 *
 * It writes the answer into `tools/world-groups.json` under "sheet", and
 * then `node tools/make-world-map.mjs` draws the map with it.
 */

const TOOL = 'tools/make-world-map.mjs'
const GROUPS = 'tools/world-groups.json'

/** The drawing is this many units across and down. */
const WIDE = 889
const HIGH = 590

/** The fit is done on every fourth cell. Finer is slower and no better. */
const COARSE = 4

/** How many handles across and down. More handles bend more sharply. */
const ACROSS = 10
const DOWN = 7

// The tool's own reading of the drawing, borrowed rather than copied.
const borrowed = readFileSync(TOOL, 'utf8')
  .replace(/\nmain\(\)\s*$/, '\n')
  .replace("import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'", '')
const tool = new Function(
  'readFileSync',
  'mkdirSync',
  'writeFileSync',
  `${borrowed}\nreturn { loadOutline, painted, landOf, loadCountries, roomTaken, simplifiedRing }`,
)(readFileSync, () => {}, () => {})

// ------------------------------------------------------- the two pictures

const wide = Math.ceil(WIDE / COARSE)
const high = Math.ceil(HIGH / COARSE)

function coarsened(fine) {
  const out = new Uint8Array(wide * high)

  for (let y = 0; y < high; y += 1) {
    for (let x = 0; x < wide; x += 1) {
      out[y * wide + x] =
        fine[Math.min(y * COARSE, HIGH - 1) * WIDE + Math.min(x * COARSE, WIDE - 1)]
    }
  }

  return out
}

const drawn = coarsened(
  tool.landOf(tool.painted(tool.loadOutline(), WIDE, HIGH), WIDE, HIGH),
)

/** Every country of the real world, thinned down to its shape. */
const world = []

for (const shapes of tool.loadCountries().values()) {
  for (const ring of shapes) {
    if (tool.roomTaken(ring) >= 3) {
      world.push(tool.simplifiedRing(ring, 0.3))
    }
  }
}

// ------------------------------------------------------- the base picture

/**
 * Robinson, the world map from a classroom wall, as a starting point.
 * A table of how wide each parallel is and how far it is from the
 * equator, every five degrees.
 */
const EVERY_FIVE_DEGREES = [
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

function flat([lon, lat], base) {
  const [wideHere, up] = robinson(lat)

  return [
    (wideHere * lon - base.lon0) * base.across,
    (base.lat0 - up * 100) * base.down,
  ]
}

// --------------------------------------------------------------- the fit

/** How much the two pictures agree: shared land over land in either. */
function agreement(rings) {
  const mine = tool.painted(rings, wide, high)
  let both = 0
  let either = 0

  for (let cell = 0; cell < drawn.length; cell += 1) {
    const a = mine[cell]
    const b = drawn[cell]

    if (a === 1 || b === 1) {
      either += 1
      if (a === 1 && b === 1) both += 1
    }
  }

  return both / either
}

function laidOut(base, handles) {
  return world.map((ring) =>
    ring.map((point) => {
      const [x, y] = flat(point, base)
      const [dx, dy] = pulledBy(handles, x, y)

      return [(x + dx) / COARSE, (y + dy) / COARSE]
    }),
  )
}

/**
 * How far the handles move a point.
 *
 * The handles sit on a grid over the drawing. A point takes a blend of
 * the four handles around it, so the bending is smooth and moving one
 * handle only disturbs its own corner of the map.
 */
function pulledBy(handles, x, y) {
  const acrossStep = WIDE / ACROSS
  const downStep = HIGH / DOWN
  const column = Math.min(Math.max(x / acrossStep, 0), ACROSS - 0.0001)
  const row = Math.min(Math.max(y / downStep, 0), DOWN - 0.0001)
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
    const handle = handles[cy * (ACROSS + 1) + cx]

    dx += handle[0] * share
    dy += handle[1] * share
  }

  return [dx, dy]
}

function main() {
  // First the plain map, with four numbers to try: where the left edge
  // and the top edge are, and how big a degree is each way.
  let base = { lon0: -146, across: 2.8, lat0: 103, down: 3.7 }
  let best = agreement(laidOut(base, blankHandles()))

  for (const by of [64, 32, 16, 8, 4, 2, 1, 0.5]) {
    let better = true

    while (better) {
      better = false

      for (const name of ['lon0', 'across', 'lat0', 'down']) {
        const size = name === 'across' || name === 'down' ? by / 40 : by

        for (const way of [1, -1]) {
          const trying = { ...base, [name]: base[name] + way * size }
          const score = agreement(laidOut(trying, blankHandles()))

          if (score > best) {
            base = trying
            best = score
            better = true
          }
        }
      }
    }
  }
  console.log(`the plain map agrees ${(best * 100).toFixed(1)}%`)

  // Then bend it, one handle at a time, until nothing improves.
  const handles = blankHandles()

  for (const by of [64, 32, 16, 8, 4, 2, 1]) {
    let moved = 1

    for (let round = 0; round < 4 && moved > 0; round += 1) {
      moved = 0

      for (let at = 0; at < handles.length; at += 1) {
        for (const [dx, dy] of [[by, 0], [-by, 0], [0, by], [0, -by]]) {
          const was = handles[at]

          handles[at] = [was[0] + dx, was[1] + dy]

          const score = agreement(laidOut(base, handles))

          if (score > best) {
            best = score
            moved += 1
          } else {
            handles[at] = was
          }
        }
      }
    }
    console.log(`  handles moved by ${by}: now ${(best * 100).toFixed(1)}%`)
  }

  const meta = JSON.parse(readFileSync(GROUPS, 'utf8'))

  delete meta.pins
  meta.sheet = {
    // WORKED OUT by tools/fit-world-sheet.mjs. Do not edit by hand.
    agrees: Number((best * 100).toFixed(1)),
    across: ACROSS,
    down: DOWN,
    wide: WIDE,
    high: HIGH,
    base: {
      lon0: Number(base.lon0.toFixed(3)),
      across: Number(base.across.toFixed(5)),
      lat0: Number(base.lat0.toFixed(3)),
      down: Number(base.down.toFixed(5)),
    },
    handles: handles.map(([dx, dy]) => [Number(dx.toFixed(2)), Number(dy.toFixed(2))]),
  }
  writeFileSync(GROUPS, `${JSON.stringify(meta, null, 2)}\n`)
  console.log(`wrote the sheet into ${GROUPS}: it agrees ${(best * 100).toFixed(1)}%`)
}

function blankHandles() {
  return Array.from({ length: (ACROSS + 1) * (DOWN + 1) }, () => [0, 0])
}

main()
