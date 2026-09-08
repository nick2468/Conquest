import type { RegionDefinition } from '../engine'
import type { DraftPlace, MapDraft } from '../maps/format'
import type { Corner } from '../maps/shapes'
import { touchingLength } from '../maps/shapes'

/**
 * Every change the map editor can make. Plan task 5.9.
 *
 * No React and no browser, so all of it is tested the way the rules are.
 * The editor screen calls these and draws whatever comes back. Nothing here
 * changes a draft in place: each one returns a new draft, which is what
 * makes undo a list of drafts rather than a list of instructions.
 */

/**
 * How near a corner has to be to snap onto one already there, in map units.
 *
 * This is the most useful thing the editor does. Two places that share a
 * border have to share the exact same corners, or the border comes out with
 * a sliver of no-man's land or a sliver of overlap along it. Nobody can
 * click the same point twice by hand, so the editor does it for them. See
 * spec S32.
 */
export const SNAP_WITHIN = 8

/** Corners already on the map, so a new one can snap onto one. */
export function cornersIn(draft: MapDraft, exceptPlace?: string): Corner[] {
  return draft.places
    .filter((place) => place.id !== exceptPlace)
    .flatMap((place) => place.corners)
}

/** Move a point onto the nearest one already there, if one is near enough. */
export function snapped(
  point: Corner,
  onto: readonly Corner[],
  within: number = SNAP_WITHIN,
): Corner {
  let best: Corner | null = null
  let nearest = within

  for (const corner of onto) {
    const away = Math.hypot(corner[0] - point[0], corner[1] - point[1])

    if (away <= nearest) {
      nearest = away
      best = corner
    }
  }

  return best ?? point
}

function replacing(
  draft: MapDraft,
  placeId: string,
  change: (place: DraftPlace) => DraftPlace,
): MapDraft {
  return {
    ...draft,
    places: draft.places.map((place) =>
      place.id === placeId ? change(place) : place,
    ),
  }
}

/** Move one corner of one place. */
export function movedCorner(
  draft: MapDraft,
  placeId: string,
  at: number,
  to: Corner,
): MapDraft {
  return replacing(draft, placeId, (place) => ({
    ...place,
    corners: place.corners.map((corner, step) => (step === at ? to : corner)),
  }))
}

/** Put a new corner in, just after the one at `at`. */
export function insertedCorner(
  draft: MapDraft,
  placeId: string,
  at: number,
  point: Corner,
): MapDraft {
  return replacing(draft, placeId, (place) => ({
    ...place,
    corners: [
      ...place.corners.slice(0, at + 1),
      point,
      ...place.corners.slice(at + 1),
    ],
  }))
}

/**
 * Take one corner out.
 *
 * Refuses to go below three. Two corners are a line, and a line has no
 * inside, so a place with two corners cannot be clicked, filled or checked
 * for overlap. Better to say no than to make a place that vanishes.
 */
export function removedCorner(
  draft: MapDraft,
  placeId: string,
  at: number,
): MapDraft {
  const place = draft.places.find((each) => each.id === placeId)

  if (place === undefined || place.corners.length <= 3) {
    return draft
  }

  return replacing(draft, placeId, (each) => ({
    ...each,
    corners: each.corners.filter((_corner, step) => step !== at),
  }))
}

/** Move where the army count is drawn. */
export function movedLabel(
  draft: MapDraft,
  placeId: string,
  to: Corner,
): MapDraft {
  return replacing(draft, placeId, (place) => ({ ...place, labelAt: to }))
}

/** Change anything else about a place. */
export function changedPlace(
  draft: MapDraft,
  placeId: string,
  changes: Partial<DraftPlace>,
): MapDraft {
  return replacing(draft, placeId, (place) => {
    const changed = { ...place, ...changes }

    // Said only when true, so a place matches one that came from a file.
    // See spec 3.3.
    if (changed.isIsland !== true) {
      delete (changed as { isIsland?: boolean }).isIsland
    }

    if (changed.drawnOver === undefined || changed.drawnOver === '') {
      delete (changed as { drawnOver?: string }).drawnOver
    }

    return changed
  })
}

/** An id nothing else is using, built from what the thing is called. */
export function freeId(taken: readonly string[], from: string): string {
  const plain =
    from
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((word, at) => (at === 0 ? word : word[0]?.toUpperCase() + word.slice(1)))
      .join('') || 'place'

  if (!taken.includes(plain)) {
    return plain
  }

  for (let step = 2; ; step += 1) {
    if (!taken.includes(`${plain}${step}`)) {
      return `${plain}${step}`
    }
  }
}

/** Put a new place on the map. */
export function addedPlace(draft: MapDraft, place: DraftPlace): MapDraft {
  return { ...draft, places: [...draft.places, place] }
}

/**
 * Take a place off the map, and every mention of it with it.
 *
 * The mentions are the point. A border left pointing at a place that is
 * gone breaks rule 4, and a city left drawn over one that is gone breaks
 * rule 9. Both would be reported as faults somewhere else entirely from the
 * thing that caused them.
 */
export function removedPlace(draft: MapDraft, placeId: string): MapDraft {
  return {
    ...draft,
    places: draft.places
      .filter((place) => place.id !== placeId)
      .map((place) => {
        const kept = {
          ...place,
          borders: place.borders.filter((border) => border !== placeId),
        }

        if (kept.drawnOver === placeId) {
          delete (kept as { drawnOver?: string }).drawnOver
        }

        return kept
      }),
  }
}

/** Change a region's name, bonus or colour. */
export function changedRegion(
  draft: MapDraft,
  regionId: string,
  changes: Partial<RegionDefinition>,
): MapDraft {
  return {
    ...draft,
    regions: draft.regions.map((region) =>
      region.id === regionId ? { ...region, ...changes } : region,
    ),
  }
}

/** Add a region. */
export function addedRegion(draft: MapDraft, region: RegionDefinition): MapDraft {
  return { ...draft, regions: [...draft.regions, region] }
}

/**
 * Take a region away, unless places are still in it.
 *
 * A place in a region that is gone breaks rule 3, and the complaint would
 * name the place rather than the region somebody deleted.
 */
export function removedRegion(draft: MapDraft, regionId: string): MapDraft {
  const stillUsed = draft.places.some((place) => place.region === regionId)

  if (stillUsed || draft.regions.length <= 1) {
    return draft
  }

  return {
    ...draft,
    regions: draft.regions.filter((region) => region.id !== regionId),
  }
}

/**
 * Add a border wherever two places touch, on both sides.
 *
 * A border typed on one side and forgotten on the other is the mistake
 * people make most, which is why it has its own rule in the spec. Where two
 * shapes run along one another, the border is already there to be read.
 *
 * It only ADDS. It never takes a border away, because a border with no
 * shared edge is not a mistake: Melbourne to Launceston crosses Bass
 * Strait, and no shape can tell you that.
 */
export function bordersFromShapes(draft: MapDraft): {
  readonly draft: MapDraft
  readonly added: number
} {
  const touching = new Map<string, Set<string>>(
    draft.places.map((place) => [place.id, new Set(place.borders)]),
  )
  let added = 0

  for (let first = 0; first < draft.places.length; first += 1) {
    for (let second = first + 1; second < draft.places.length; second += 1) {
      const one = draft.places[first] as DraftPlace
      const two = draft.places[second] as DraftPlace

      if (touchingLength(one.corners, two.corners) <= 0) {
        continue
      }

      if (!touching.get(one.id)?.has(two.id)) {
        touching.get(one.id)?.add(two.id)
        added += 1
      }

      if (!touching.get(two.id)?.has(one.id)) {
        touching.get(two.id)?.add(one.id)
        added += 1
      }
    }
  }

  return {
    added,
    draft: {
      ...draft,
      places: draft.places.map((place) => ({
        ...place,
        borders: [...(touching.get(place.id) ?? [])].sort(),
      })),
    },
  }
}

/** A square, to start a new place from. */
export function squareAt(middle: Corner, across: number): Corner[] {
  const half = across / 2

  return [
    [middle[0] - half, middle[1] - half],
    [middle[0] + half, middle[1] - half],
    [middle[0] + half, middle[1] + half],
    [middle[0] - half, middle[1] + half],
  ]
}

// ------------------------------------------------------ cutting a place

/**
 * Where two lines cross, if they do.
 *
 * `along` is how far down the first line the crossing is, from 0 at its
 * start to 1 at its end, and `across` is the same for the second.
 */
function crossing(
  from: Corner,
  to: Corner,
  edgeFrom: Corner,
  edgeTo: Corner,
): { along: number; across: number; at: Corner } | null {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const ex = edgeTo[0] - edgeFrom[0]
  const ey = edgeTo[1] - edgeFrom[1]
  const slant = dx * ey - dy * ex

  // Side by side. Two lines that never meet, or lie on top of each other.
  if (slant === 0) {
    return null
  }

  const gapX = edgeFrom[0] - from[0]
  const gapY = edgeFrom[1] - from[1]
  const along = (gapX * ey - gapY * ex) / slant
  const across = (gapX * dy - gapY * dx) / slant

  if (along < 0 || along > 1 || across < 0 || across > 1) {
    return null
  }

  return {
    along,
    across,
    at: [
      Math.round(from[0] + along * dx),
      Math.round(from[1] + along * dy),
    ],
  }
}

/**
 * Cut a shape in two along a line drawn across it.
 *
 * This is how a continent becomes territories. Nick: "How will custom
 * non-real world maps work?" Like this: draw the land, then cut it up.
 * Nothing about the real world comes into it.
 *
 * The line is carried on a long way past both of its ends before the
 * cutting starts, so nobody has to press exactly in the sea. Press
 * roughly across the place and it goes right across.
 *
 * Where the line first enters the shape and last leaves it, the shape is
 * split, and the piece of line between those two points becomes the new
 * border. BOTH halves are given the SAME points for that border, so they
 * share it exactly and no sliver can appear between them. That is the
 * whole reason the editor exists (spec S32).
 */
export function cutInTwo(
  corners: readonly Corner[],
  drawn: readonly Corner[],
): [Corner[], Corner[]] | null {
  if (corners.length < 3 || drawn.length < 2) {
    return null
  }

  const line = carriedOn(drawn)
  const found: Array<{ down: number; round: number; at: Corner }> = []

  for (let step = 0; step + 1 < line.length; step += 1) {
    for (let edge = 0; edge < corners.length; edge += 1) {
      const met = crossing(
        line[step] as Corner,
        line[step + 1] as Corner,
        corners[edge] as Corner,
        corners[(edge + 1) % corners.length] as Corner,
      )

      if (met !== null) {
        found.push({
          down: step + met.along,
          round: edge + met.across,
          at: met.at,
        })
      }
    }
  }

  if (found.length < 2) {
    return null
  }

  found.sort((one, two) => one.down - two.down)

  const goesIn = found[0] as { down: number; round: number; at: Corner }
  const comesOut = found[found.length - 1] as typeof goesIn

  // The corners of the shape between one crossing and the next, going the
  // way the shape is written.
  const between = (from: number, to: number): Corner[] => {
    const count = corners.length
    const fromEdge = Math.floor(from)
    const toEdge = Math.floor(to)
    let steps = (toEdge - fromEdge + count) % count

    if (steps === 0 && to < from) {
      steps = count
    }

    const out: Corner[] = []

    for (let step = 1; step <= steps; step += 1) {
      out.push(corners[(fromEdge + step) % count] as Corner)
    }

    return out
  }

  // The bends in the drawn line that lie between the two crossings.
  const bends = line.filter(
    (_, at) => at > goesIn.down && at < comesOut.down,
  ) as Corner[]
  const border = [goesIn.at, ...bends, comesOut.at]
  const oneWay = [...border, ...between(goesIn.round, comesOut.round)]
  const theOther = [
    ...[...border].reverse(),
    ...between(comesOut.round, goesIn.round),
  ]

  if (oneWay.length < 3 || theOther.length < 3) {
    return null
  }

  return [oneWay, theOther]
}

/**
 * The drawn line, carried on a long way past both ends.
 *
 * A line that begins inside the place only leaves it once, and one
 * crossing cannot cut anything in two. Carrying both ends outwards means
 * a line pressed roughly across the place always goes right across it.
 */
function carriedOn(line: readonly Corner[]): Corner[] {
  const FAR = 10000
  const first = line[0] as Corner
  const second = line[1] as Corner
  const last = line[line.length - 1] as Corner
  const beforeLast = line[line.length - 2] as Corner
  const outwards = (from: Corner, towards: Corner): Corner => {
    const dx = from[0] - towards[0]
    const dy = from[1] - towards[1]
    const length = Math.hypot(dx, dy) || 1

    return [
      Math.round(from[0] + (dx / length) * FAR),
      Math.round(from[1] + (dy / length) * FAR),
    ]
  }

  return [outwards(first, second), ...line, outwards(last, beforeLast)]
}

/** The middle of a shape, for the army count to sit in. */
function middleOf(corners: readonly Corner[]): Corner {
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)

  return [
    Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  ]
}

/**
 * Cut one place into two along a drawn line.
 *
 * The old place keeps the bigger half, its id and its name. The smaller
 * half becomes a new place, in the same continent, named by whoever is
 * drawing.
 *
 * Both halves border each other, and both keep the old place's borders.
 * Anybody who bordered the old place now borders both. That is more
 * borders than the map wants, and it is on purpose: "Work out the
 * borders" then trims the list to the places that really touch. Guessing
 * here and getting it wrong would lose a border nobody notices missing.
 */
export function cutPlaceInTwo(
  draft: MapDraft,
  placeId: string,
  line: readonly Corner[],
  named: { id: string; name: string; shortName: string },
): MapDraft | null {
  const place = draft.places.find((each) => each.id === placeId)

  if (place === undefined) {
    return null
  }

  const halves = cutInTwo(place.corners, line)

  if (halves === null) {
    return null
  }

  const [bigger, smaller] = halves.sort(
    (one, two) => Math.abs(roomIn(two)) - Math.abs(roomIn(one)),
  ) as [Corner[], Corner[]]
  const keeps: DraftPlace = {
    ...place,
    corners: bigger,
    labelAt: middleOf(bigger),
    borders: [...place.borders, named.id],
  }
  const fresh: DraftPlace = {
    id: named.id,
    name: named.name,
    shortName: named.shortName,
    region: place.region,
    borders: [...place.borders, place.id],
    corners: smaller,
    labelAt: middleOf(smaller),
  }

  return {
    ...draft,
    places: [
      ...draft.places.map((each) => {
        if (each.id === place.id) {
          return keeps
        }

        return each.borders.includes(place.id)
          ? { ...each, borders: [...each.borders, named.id] }
          : each
      }),
      fresh,
    ],
  }
}

/** How much room a shape takes up. Negative if it is written backwards. */
function roomIn(corners: readonly Corner[]): number {
  let total = 0

  for (let at = 0; at < corners.length; at += 1) {
    const [x1, y1] = corners[at] as Corner
    const [x2, y2] = corners[(at + 1) % corners.length] as Corner

    total += x1 * y2 - x2 * y1
  }

  return total / 2
}
