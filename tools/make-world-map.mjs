import { readFileSync, writeFileSync } from 'node:fs'

/**
 * Draw the world map. Plan task 5.8.
 *
 * OURS, with no strings attached, and now with borders that WANDER.
 *
 * Three goes at this. The first was drawn from rectangles by hand: "far
 * too blocky". The second traced somebody else's drawing, which meant a
 * licence asking for credit and share-alike, and Nick did not want that.
 * The third cut real coastlines with straight cells of our own, which fixed
 * the coast and left the inland borders dead straight: "the inner borders
 * have too many straight lines, I'd like the maps to be more impressive
 * and realistic."
 *
 * **So the inland borders are real borders now.** Each place is a group of
 * real countries, joined together. Where a place is part of ONE country,
 * such as the two halves of the United States, it is a group of that
 * country's real provinces instead. The border between Peru and Brazil in
 * the game is the border between Peru and Brazil in the world.
 *
 * Everything is public domain: Natural Earth's own words are "No permission
 * is needed to use Natural Earth. Crediting the authors is unnecessary."
 * The data sits in `tools/data`, so a build needs no internet.
 *
 * **Joining countries works because the data shares its edges.** Where two
 * countries meet, both hold the SAME line, one running each way. So the
 * join is: throw away every edge that appears in both directions, because
 * that is a border inside the group, and stitch what is left into a ring.
 * Half the edges in the file have their reverse present, which is exactly
 * the half that is a land border.
 *
 * Run it with:  node tools/make-world-map.mjs
 */

const COUNTRIES = 'tools/data/ne-50m-countries.geojson'
const PROVINCES = 'tools/data/ne-50m-provinces.geojson'
const GROUPS = 'tools/world-groups.json'
const WRITE_TO = 'src/maps/world.ts'

/**
 * The board is this many units wide and high. The classic board is about
 * one and a half times as wide as it is high, which also fits an iPad on
 * its side with the score down one edge.
 */
const WIDE = 936
const HIGH = 645

/** Islands smaller than this are left off, in square degrees. */
const TOO_SMALL = 0.6

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

/** Every country, by name, as a list of rings. */
function loadCountries() {
  const found = new Map()

  for (const feature of JSON.parse(readFileSync(COUNTRIES, 'utf8')).features) {
    found.set(feature.properties.NAME, ringsOf(feature.geometry))
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
      rings: ringsOf(feature.geometry),
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
const SIMPLIFY_TO = Number(process.env['SIMPLIFY'] ?? 0.7)

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

// ---------------------------------------------------------- the projection

/**
 * The board, not the globe.
 *
 * Nick: "The map needs to be representative not real world scale
 * accurate," and the board he is aiming for is the classic one, which
 * everybody already knows. Its shapes are close to the Mercator map from a
 * schoolroom wall: continents keep their familiar shape, the far north is
 * stretched, and the tropics are a little squashed. So that is what this
 * does. Longitude goes straight across. Latitude goes down a curve with a
 * few control points, steepest around Europe and Canada and gentlest in
 * the tropics and the far south, with a straight line between each pair
 * of points. Both live in `tools/world-groups.json` under "board".
 *
 * There was a version with sixty pins pulling a rubber sheet, so that any
 * landmark could be put anywhere. Nick: "very distorted and child like."
 * Every pin sheared the land around it. A curve that only ever stretches
 * up and down cannot shear anything, and that is why the shapes stay
 * recognisable. EVERY point goes through the same curve, so two places
 * that shared a border still share it exactly.
 */
function bent(value, controls) {
  const first = controls[0]
  const last = controls[controls.length - 1]

  // Past either end the last straight line carries on.
  if (value <= first[0] || value >= last[0]) {
    const [from, to] = value <= first[0] ? [controls[0], controls[1]] : [controls[controls.length - 2], last]

    return from[1] + ((value - from[0]) / (to[0] - from[0])) * (to[1] - from[1])
  }

  for (let at = 0; at + 1 < controls.length; at += 1) {
    const [fromIn, fromOut] = controls[at]
    const [toIn, toOut] = controls[at + 1]

    if (value >= fromIn && value <= toIn) {
      return fromOut + ((value - fromIn) / (toIn - fromIn)) * (toOut - fromOut)
    }
  }

  return value
}

let BOARD = { across: [[-180, 0], [180, 1]], down: [[90, 0], [-90, 1]] }

function project([lon, lat]) {
  return [
    Number((bent(lon, BOARD.across) * WIDE).toFixed(1)),
    Number((bent(lat, BOARD.down) * HIGH).toFixed(1)),
  ]
}

/**
 * Where a place goes on the board without being bent itself.
 *
 * A place that touches nothing else, an island or Australia, is drawn at
 * the scale the board has where its middle lands, and then left alone. So
 * it takes the stretch of its own part of the board, and no more, and
 * the nudge below then sizes it for the game.
 */
function projectedTrue(ring, middle) {
  const [midX, midY] = project(middle)
  const step = 0.5
  const scaleX = (project([middle[0] + step, middle[1]])[0] - project([middle[0] - step, middle[1]])[0]) / (2 * step)
  const scaleY = (project([middle[0], middle[1] - step])[1] - project([middle[0], middle[1] + step])[1]) / (2 * step)

  return ring.map(([lon, lat]) => [
    Number((midX + (lon - middle[0]) * scaleX).toFixed(1)),
    Number((midY - (lat - middle[1]) * scaleY).toFixed(1)),
  ])
}

/**
 * The middle of a group's box, in longitude and latitude. A group that
 * stands alone, such as the two halves of Australia, goes through the
 * bend as ONE piece about ONE middle, or the halves drift apart.
 */
function middleOfAll(rings) {
  const xs = rings.flatMap((ring) => ring.map(([lon]) => lon))
  const ys = rings.flatMap((ring) => ring.map(([, lat]) => lat))

  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ]
}

/**
 * Move and resize a group of places that touch nothing else.
 *
 * An island, or a continent with no land border, can go wherever the board
 * has room. Australia can move to the corner it has to itself, and
 * Greenland can shrink to what it is worth in a game. Each nudge scales
 * the group about the middle of its own box and then slides it, in map
 * units, after the bend above has been applied.
 */
function nudged(places, nudges) {
  for (const [name, nudge] of Object.entries(nudges ?? {})) {
    const group = places.filter(
      (place) => place.id === name || place.region === name,
    )

    if (group.length === 0) {
      throw new Error(`Nothing called "${name}" to nudge.`)
    }

    const xs = group.flatMap((place) => place.corners.map(([x]) => x))
    const ys = group.flatMap((place) => place.corners.map(([, y]) => y))
    const middleX = (Math.min(...xs) + Math.max(...xs)) / 2
    const middleY = (Math.min(...ys) + Math.max(...ys)) / 2
    const scale = nudge.scale ?? 1

    for (const place of group) {
      place.corners = place.corners.map(([x, y]) => [
        Number((middleX + (x - middleX) * scale + (nudge.dx ?? 0)).toFixed(1)),
        Number((middleY + (y - middleY) * scale + (nudge.dy ?? 0)).toFixed(1)),
      ])
    }
  }
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

  // The curves read top to bottom in the file, but bent() walks upwards.
  const upwards = (controls) => [...controls].sort((a, b) => a[0] - b[0])

  BOARD = { across: upwards(meta.board.across), down: upwards(meta.board.down) }

  const countries = loadCountries()
  const provinces = loadProvinces()

  // Every province, sorted into the place it belongs to.
  const provincesFor = new Map()
  let homeless = []

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

  const built = []
  const unknown = []

  for (const place of meta.places) {
    const rings = []

    for (const name of place.countries ?? []) {
      const found = countries.get(name)

      if (found === undefined) {
        unknown.push(`${place.id}: ${name}`)
        continue
      }

      rings.push(...found.filter((ring) => roomTaken(ring) >= TOO_SMALL))
    }

    for (const province of provincesFor.get(place.id) ?? []) {
      rings.push(...province.rings.filter((ring) => roomTaken(ring) >= TOO_SMALL))
    }

    if (rings.length === 0) {
      throw new Error(`"${place.id}" is made of nothing.`)
    }

    const outlines = joined(rings)

    built.push({ ...place, pieces: outlines.length, outline: outlines[0] })
  }

  // Every place at once, so a shared border is simplified once.
  const thinner = simplifyTogether(
    new Map(built.map((place) => [place.id, place.outline])),
    SIMPLIFY_TO,
  )

  const standsAlone = (place) =>
    Object.keys(meta.nudge ?? {}).find(
      (name) => name === place.id || name === place.region,
    )

  for (const place of built) {
    const ring = thinner.get(place.id)
    const group = standsAlone(place)
    const middle =
      group === undefined
        ? null
        : middleOfAll(
            built
              .filter((other) => standsAlone(other) === group)
              .map((other) => thinner.get(other.id)),
          )

    place.corners = (middle ? projectedTrue(ring, middle) : ring.map((p) => project(p)))
      .filter(
        (point, at, all) =>
          at === 0 || point[0] !== all[at - 1][0] || point[1] !== all[at - 1][1],
      )
  }

  nudged(built, meta.nudge)

  for (const place of built) {
    place.labelAt = roomiestIn(place.corners)
  }

  if (unknown.length > 0) {
    throw new Error(`No such country:\n  ${unknown.join('\n  ')}`)
  }

  const several = built.filter((place) => place.pieces > 1)

  if (several.length > 0) {
    console.log(
      'in several pieces, biggest kept: ' +
        several.map((place) => `${place.id}(${place.pieces})`).join(' '),
    )
  }

  console.log(
    `places: ${built.length}, corners: ` +
      built.reduce((sum, place) => sum + place.corners.length, 0),
  )

  const xs = built.flatMap((place) => place.corners.map(([x]) => x))
  const ys = built.flatMap((place) => place.corners.map(([, y]) => y))
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
