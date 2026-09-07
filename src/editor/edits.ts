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
