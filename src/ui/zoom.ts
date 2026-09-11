import type { GameMap, TerritoryDefinition, TerritoryId } from '../engine'
import { cornersOf as cornersOfShape } from '../maps/shapes'

/**
 * Working out what part of the map to show.
 *
 * Nick's idea: show the whole board, and open a larger local view when a
 * place is tapped. Thirty-eight places on one screen is a lot to read, and
 * Perth, Canberra and the islands are small targets for a finger.
 *
 * No React here, so the arithmetic is tested without a browser. The screen
 * asks for a viewBox and draws it.
 */

/**
 * The corners of a territory, read back out of its drawn shape.
 *
 * The reading itself lives in `maps/shapes.ts`, because the map guards need
 * exactly the same thing. There was a second copy of it here for a day. Two
 * copies of the same arithmetic is how the two ever come to disagree.
 */
export function cornersOf(
  territory: TerritoryDefinition,
): Array<readonly [number, number]> {
  return cornersOfShape(territory.shape)
}

/** Roughly the middle of a shape. Good enough to point a line at. */
export function middleOf(territory: TerritoryDefinition): {
  readonly x: number
  readonly y: number
} {
  const corners = cornersOf(territory)

  if (corners.length === 0) {
    return { x: territory.labelAt.x, y: territory.labelAt.y }
  }

  const total = corners.reduce(
    (sum, [x, y]) => ({ x: sum.x + x, y: sum.y + y }),
    { x: 0, y: 0 },
  )

  return { x: total.x / corners.length, y: total.y / corners.length }
}

/** The middle of the whole board. */
export function middleOfMap(map: GameMap): { readonly x: number; readonly y: number } {
  const whole = readViewBox(map.viewBox)

  return {
    x: whole.left + whole.width / 2,
    y: whole.top + whole.height / 2,
  }
}

/**
 * True when the shortest way between two points goes round the back of the
 * world, off one edge of the map and on at the other, as Alaska to
 * Kamchatka does. A straight line between them would cross the whole board.
 */
export function goesRoundTheBack(
  map: GameMap,
  one: { readonly x: number },
  two: { readonly x: number },
): boolean {
  return Math.abs(one.x - two.x) > readViewBox(map.viewBox).width / 2
}

interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function readViewBox(viewBox: string): Box {
  const [left, top, width, height] = viewBox.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ]

  return { left, top, width, height }
}

function asViewBox(box: Box): string {
  return `${box.left} ${box.top} ${box.width} ${box.height}`
}

/** How much clear space to leave around the places being looked at. */
const PADDING = 0.1

/**
 * The closest the map will ever go.
 *
 * Without a limit, tapping Perth framed three places and filled the screen
 * with them. That is not a close view of the board, it is a different board.
 * You lose all sense of where you are, and the whole point of the small map
 * being on screen is knowing where you are.
 */
const CLOSEST = 3.2

/**
 * The places to show when looking closely at somewhere.
 *
 * The place itself and everything bordering it. The neighbours matter: an
 * attack always crosses a border, so a view of only the tapped place would
 * hide every target worth having.
 */
export function placesInView(
  map: GameMap,
  territoryId: TerritoryId,
): TerritoryDefinition[] {
  const middle = map.territories.find((each) => each.id === territoryId)

  if (middle === undefined) {
    return []
  }

  const wanted = new Set<TerritoryId>([middle.id, ...middle.borders])

  return map.territories.filter((each) => wanted.has(each.id))
}

/**
 * The viewBox that frames a place and everywhere it can reach.
 *
 * Pass null for the whole board. The result keeps the map's own shape, so
 * the drawing never stretches, and never shows anything outside the map.
 *
 * The frame follows the PLACE tapped, not the region it sits in. Framing
 * whole regions was the first attempt and it failed where it was needed
 * most: Western Australia covers a third of the board, so its frame zoomed
 * by 1.1, yet it contains Perth and Rottnest Island, the two smallest
 * targets on the map. The place is the right unit because a small place
 * gets a small frame.
 */
export function viewBoxFor(
  map: GameMap,
  territoryId: TerritoryId | null,
): string {
  const whole = readViewBox(map.viewBox)

  if (territoryId === null) {
    return map.viewBox
  }

  const places = placesInView(map, territoryId)
  const corners = places.flatMap(cornersOf)

  if (corners.length === 0) {
    return map.viewBox
  }

  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)

  // Labels sit beside their place, and a name hangs below its count, so the
  // frame has to reach past the shapes or a name is cut in half.
  const labelRoom = 34
  const lefts = [...xs, ...places.map((each) => each.labelAt.x - labelRoom)]
  const rights = [...xs, ...places.map((each) => each.labelAt.x + labelRoom)]
  const tops = [...ys, ...places.map((each) => each.labelAt.y - labelRoom)]
  const bottoms = [...ys, ...places.map((each) => each.labelAt.y + labelRoom)]

  const tight = {
    left: Math.min(...lefts),
    top: Math.min(...tops),
    width: Math.max(...rights) - Math.min(...lefts),
    height: Math.max(...bottoms) - Math.min(...tops),
  }

  const padded = {
    left: tight.left - tight.width * PADDING,
    top: tight.top - tight.height * PADDING,
    width: tight.width * (1 + PADDING * 2),
    height: tight.height * (1 + PADDING * 2),
  }

  return asViewBox(clampInside(noCloserThan(matchShapeOf(padded, whole), whole), whole))
}

/** Back off if the frame is closer than the map ever goes. */
function noCloserThan(box: Box, whole: Box): Box {
  const closest = whole.width / CLOSEST

  if (box.width >= closest) {
    return box
  }

  const grow = closest / box.width

  return {
    left: box.left - (box.width * grow - box.width) / 2,
    top: box.top - (box.height * grow - box.height) / 2,
    width: box.width * grow,
    height: box.height * grow,
  }
}

/** Grow the box until it has the same shape as the whole map. */
function matchShapeOf(box: Box, whole: Box): Box {
  const wanted = whole.width / whole.height
  const has = box.width / box.height

  if (has < wanted) {
    const width = box.height * wanted

    return {
      ...box,
      left: box.left - (width - box.width) / 2,
      width,
    }
  }

  const height = box.width / wanted

  return {
    ...box,
    top: box.top - (height - box.height) / 2,
    height,
  }
}

/** Slide the box back inside the map, and never zoom out past the map. */
function clampInside(box: Box, whole: Box): Box {
  const width = Math.min(box.width, whole.width)
  const height = Math.min(box.height, whole.height)

  return {
    width,
    height,
    left: Math.min(
      Math.max(box.left, whole.left),
      whole.left + whole.width - width,
    ),
    top: Math.min(
      Math.max(box.top, whole.top),
      whole.top + whole.height - height,
    ),
  }
}

/** How much closer this view is than the whole map. */
export function magnification(
  map: GameMap,
  territoryId: TerritoryId | null,
): number {
  const whole = readViewBox(map.viewBox)
  const shown = readViewBox(viewBoxFor(map, territoryId))

  return whole.width / shown.width
}

/**
 * How wide a place looks in a given view, as a fraction of the screen.
 *
 * This is what decides whether the close view is any use. A place that
 * covers a hundredth of the screen is a hard target for a finger.
 */
export function widthOnScreen(
  place: TerritoryDefinition,
  viewBox: string,
): number {
  const shown = readViewBox(viewBox)
  const xs = cornersOf(place).map(([x]) => x)

  if (xs.length === 0) {
    return 0
  }

  return (Math.max(...xs) - Math.min(...xs)) / shown.width
}
