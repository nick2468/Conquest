import type { GameMap, RegionDefinition, TerritoryDefinition } from '../engine'
import type { Corner } from './shapes'
import { cornersOf, pathFrom } from './shapes'
import type { MapProblem } from './validate'
import { validateMap } from './validate'

/**
 * The map file. Plan tasks 5.5 and 5.6.
 *
 * A Conquest map is a JSON file. A browser reads JSON without help, a
 * person can read and change one, and nothing in it is code, so loading a
 * map can never run anything.
 *
 * **Places are written as corners, not as drawn paths.** That is the one
 * design decision here that matters. Neighbouring places then share the
 * exact same points, so a border cannot come out with a sliver of
 * no-man's land along it or a sliver of overlap. The map we ship was
 * built that way for exactly that reason, and it still had one overlap
 * that took a guard to find.
 *
 * Everything that comes out of here is checked twice. First that the file
 * makes sense at all, then by `validateMap`, which is the same ten rules
 * every map we ship must pass. A person who wrote the map is the one
 * reading the complaint, so every message says what to do about it.
 */

/** The version of the format. A file must say which one it is written in. */
export const MAP_FORMAT = 1

/**
 * Limits on a file from outside.
 *
 * A map file comes from somewhere we do not control, so it gets the same
 * suspicion any outside file gets. None of these stop an honest map: the
 * detailed Australia has 38 places and the longest coastline has 30-odd
 * corners.
 */
const MOST_TEXT = 2_000_000
const MOST_PLACES = 500
const MOST_REGIONS = 100
const MOST_CORNERS = 2000
const MOST_LETTERS = 120

const A_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

type Unknown = Record<string, unknown>

function isObject(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fault(rule: string, message: string): MapProblem {
  return { rule, message }
}

/** A word for a person, when the file holds the wrong kind of thing. */
function whatItIs(value: unknown): string {
  if (value === null) {
    return 'nothing'
  }

  if (Array.isArray(value)) {
    return 'a list'
  }

  return typeof value
}

// --------------------------------------------------- the shape of a file

/**
 * One place, as a file holds it.
 *
 * Corners, not a drawn path. See spec S32. The map editor works on this
 * rather than on a `GameMap`, because corners are the thing you can take
 * hold of and move.
 */
export interface DraftPlace {
  readonly id: string
  readonly name: string
  readonly shortName: string
  readonly region: string
  readonly borders: readonly string[]
  readonly corners: readonly Corner[]
  readonly labelAt: Corner
  readonly isIsland?: boolean
  readonly drawnOver?: string
}

/** A whole map, as a file holds it. */
export interface MapDraft {
  readonly id: string
  readonly name: string
  readonly viewBox: string
  readonly regions: readonly RegionDefinition[]
  readonly places: readonly DraftPlace[]
}

/** A map, turned back into the corners a file holds and an editor moves. */
export function toDraft(map: GameMap): MapDraft {
  return {
    id: map.id,
    name: map.name,
    viewBox: map.viewBox,
    regions: map.regions.map((region) => ({ ...region })),
    places: map.territories.map((territory) => ({
      id: territory.id,
      name: territory.name,
      shortName: territory.shortName,
      region: territory.regionId,
      borders: [...territory.borders],
      corners: cornersOf(territory.shape),
      labelAt: [territory.labelAt.x, territory.labelAt.y] as Corner,
      ...(territory.isIsland === true ? { isIsland: true } : {}),
      ...(territory.drawnOver === undefined
        ? {}
        : { drawnOver: territory.drawnOver }),
    })),
  }
}

/**
 * A draft, turned into a map the game can draw and check.
 *
 * Nothing is checked here. The editor draws a half-finished map all the
 * time, and says what is wrong with it beside the drawing rather than
 * refusing to show it.
 */
export function fromDraft(draft: MapDraft): GameMap {
  return {
    id: draft.id,
    name: draft.name,
    viewBox: draft.viewBox,
    regions: draft.regions.map((region) => ({ ...region })),
    territories: draft.places.map((place) => ({
      id: place.id,
      name: place.name,
      shortName: place.shortName,
      regionId: place.region,
      borders: [...place.borders],
      shape: pathFrom(place.corners),
      labelAt: { x: place.labelAt[0], y: place.labelAt[1] },
      ...(place.isIsland === true ? { isIsland: true } : {}),
      ...(place.drawnOver === undefined ? {} : { drawnOver: place.drawnOver }),
    })),
  }
}

// ------------------------------------------------------------- writing out

/** Write a draft out as a file. */
export function writeDraft(draft: MapDraft): string {
  return `${JSON.stringify(
    {
      conquestMap: MAP_FORMAT,
      id: draft.id,
      name: draft.name,
      viewBox: draft.viewBox,
      regions: draft.regions.map((region) => ({
        id: region.id,
        name: region.name,
        bonus: region.bonus,
        outline: region.outline,
      })),
      places: draft.places.map((place) => ({
        id: place.id,
        name: place.name,
        shortName: place.shortName,
        region: place.region,
        borders: [...place.borders],
        corners: place.corners.map(([x, y]) => [x, y]),
        labelAt: [place.labelAt[0], place.labelAt[1]],
        ...(place.isIsland === true ? { isIsland: true } : {}),
        ...(place.drawnOver === undefined
          ? {}
          : { drawnOver: place.drawnOver }),
      })),
    },
    null,
    2,
  )}
`
}

/**
 * Write a map out as a file.
 *
 * Used by the "save this map" button, so a player can take the map we ship,
 * change something in it, and load it back. That is a far better starting
 * point than a blank page.
 */
export function writeMap(map: GameMap): string {
  return writeDraft(toDraft(map))
}

// -------------------------------------------------------------- reading in

/** What came back from reading a file. One or the other, never both. */
export type MapRead =
  | { readonly map: GameMap; readonly problems?: undefined }
  | { readonly map?: undefined; readonly problems: MapProblem[] }

function readWords(
  value: unknown,
  what: string,
  problems: MapProblem[],
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(
      fault('a map file', `${what} is missing. It should be some words.`),
    )
    return ''
  }

  if (value.length > MOST_LETTERS) {
    problems.push(
      fault(
        'a map file',
        `${what} is ${value.length} letters long. Keep it under ` +
          `${MOST_LETTERS}, or it will not fit on the screen.`,
      ),
    )
    return value.slice(0, MOST_LETTERS)
  }

  return value
}

function readNumber(
  value: unknown,
  what: string,
  problems: MapProblem[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    problems.push(
      fault(
        'a map file',
        `${what} should be a number, and it is ${whatItIs(value)}.`,
      ),
    )
    return 0
  }

  return value
}

function readCorner(
  value: unknown,
  what: string,
  problems: MapProblem[],
): Corner {
  if (!Array.isArray(value) || value.length !== 2) {
    problems.push(
      fault(
        'a map file',
        `${what} should be two numbers, an across and a down, like ` +
          `[408, 192].`,
      ),
    )
    return [0, 0]
  }

  return [
    readNumber(value[0], `${what}, the across part`, problems),
    readNumber(value[1], `${what}, the down part`, problems),
  ]
}

function readColour(
  value: unknown,
  what: string,
  problems: MapProblem[],
): string {
  if (typeof value !== 'string' || !A_COLOUR.test(value)) {
    problems.push(
      fault(
        'a map file',
        `${what} should be a colour written as "#b8763a" or "#b83". ` +
          `It says ${JSON.stringify(value)}.`,
      ),
    )
    return '#000000'
  }

  return value
}

function readRegion(value: unknown, at: number, problems: MapProblem[]) {
  if (!isObject(value)) {
    problems.push(
      fault('a map file', `Region ${at + 1} is ${whatItIs(value)}, not a region.`),
    )
    return null
  }

  const where = `Region ${at + 1}`

  const region: RegionDefinition = {
    id: readWords(value['id'], `${where} has no id, so it`, problems),
    name: readWords(value['name'], `${where} has no name, so it`, problems),
    bonus: Math.trunc(
      readNumber(value['bonus'], `${where}'s bonus`, problems),
    ),
    outline: readColour(value['outline'], `${where}'s outline`, problems),
  }

  if (region.bonus < 0) {
    problems.push(
      fault(
        'a map file',
        `${where} pays a bonus of ${region.bonus}. A bonus cannot be less ` +
          `than nothing.`,
      ),
    )
  }

  return region
}

function readPlace(value: unknown, at: number, problems: MapProblem[]) {
  if (!isObject(value)) {
    problems.push(
      fault('a map file', `Place ${at + 1} is ${whatItIs(value)}, not a place.`),
    )
    return null
  }

  const id = readWords(value['id'], `Place ${at + 1} has no id, so it`, problems)
  const where = `Place "${id === '' ? at + 1 : id}"`

  const borders = Array.isArray(value['borders'])
    ? value['borders'].filter((each): each is string => typeof each === 'string')
    : []

  if (!Array.isArray(value['borders'])) {
    problems.push(
      fault(
        'a map file',
        `${where} has no borders. Every place needs a list of the places ` +
          `you can attack from it, even if the list is empty.`,
      ),
    )
  }

  const rawCorners = value['corners']

  if (!Array.isArray(rawCorners) || rawCorners.length < 3) {
    problems.push(
      fault(
        'a map file',
        `${where} needs at least three corners to be a shape. ` +
          `It has ${Array.isArray(rawCorners) ? rawCorners.length : 'none'}.`,
      ),
    )
    return null
  }

  if (rawCorners.length > MOST_CORNERS) {
    problems.push(
      fault(
        'a map file',
        `${where} has ${rawCorners.length} corners. That is more than ` +
          `${MOST_CORNERS}, which is more than any real coastline needs.`,
      ),
    )
    return null
  }

  const corners = rawCorners.map((corner, step) =>
    readCorner(corner, `${where}, corner ${step + 1},`, problems),
  )

  const territory: TerritoryDefinition = {
    id,
    name: readWords(value['name'], `${where} has no name, so it`, problems),
    shortName: readWords(
      value['shortName'],
      `${where} has no short name, so it`,
      problems,
    ),
    regionId: readWords(
      value['region'],
      `${where} names no region, so it`,
      problems,
    ),
    borders,
    shape: pathFrom(corners),
    labelAt: (() => {
      const [x, y] = readCorner(
        value['labelAt'],
        `${where}'s labelAt`,
        problems,
      )
      return { x, y }
    })(),
    ...(value['isIsland'] === true ? { isIsland: true } : {}),
    ...(typeof value['drawnOver'] === 'string'
      ? { drawnOver: value['drawnOver'] }
      : {}),
  }

  return territory
}

/**
 * Read a map file.
 *
 * Gives back either a map or a list of what is wrong with the file. Never
 * both, and never a half-built map: a map that is only partly right would
 * fail later, somewhere far away from the mistake.
 */
export function readMap(
  text: string,
  options: {
    /**
     * Check the ten rules of a map, as well as the file itself.
     *
     * The map editor turns this OFF. A map with an overlap in it is exactly
     * the map somebody wants to open in an editor, and refusing to open it
     * would send them back to a text editor to fix the very thing the
     * editor exists for. The editor shows the same faults beside the
     * drawing instead.
     */
    readonly checkRules?: boolean
  } = {},
): MapRead {
  const checkRules = options.checkRules ?? true
  const problems: MapProblem[] = []

  if (text.length > MOST_TEXT) {
    return {
      problems: [
        fault(
          'a map file',
          `That file is ${text.length} characters. A map is nowhere near ` +
            `that big, so this is probably not one.`,
        ),
      ],
    }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch (trouble) {
    return {
      problems: [
        fault(
          'a map file',
          `That file could not be read. A map is written in JSON, and this ` +
            `is not: ${trouble instanceof Error ? trouble.message : 'unreadable'}`,
        ),
      ],
    }
  }

  if (!isObject(parsed)) {
    return {
      problems: [
        fault(
          'a map file',
          `A map file holds one map, and this file holds ` +
            `${whatItIs(parsed)}.`,
        ),
      ],
    }
  }

  const version = parsed['conquestMap']

  if (version !== MAP_FORMAT) {
    return {
      problems: [
        fault(
          'a map file',
          version === undefined
            ? `This does not say it is a Conquest map. The first line of a ` +
              `map file is "conquestMap": ${MAP_FORMAT}.`
            : `This map is written in format ${JSON.stringify(version)}, and ` +
              `this game reads format ${MAP_FORMAT}.`,
        ),
      ],
    }
  }

  const rawRegions = parsed['regions']
  const rawPlaces = parsed['places']

  if (!Array.isArray(rawRegions) || rawRegions.length === 0) {
    problems.push(
      fault('a map file', 'A map needs a list of regions, and has none.'),
    )
  }

  if (!Array.isArray(rawPlaces) || rawPlaces.length === 0) {
    problems.push(
      fault('a map file', 'A map needs a list of places, and has none.'),
    )
  }

  if (Array.isArray(rawRegions) && rawRegions.length > MOST_REGIONS) {
    problems.push(
      fault(
        'a map file',
        `This map has ${rawRegions.length} regions. The most allowed is ` +
          `${MOST_REGIONS}.`,
      ),
    )
  }

  if (Array.isArray(rawPlaces) && rawPlaces.length > MOST_PLACES) {
    problems.push(
      fault(
        'a map file',
        `This map has ${rawPlaces.length} places. The most allowed is ` +
          `${MOST_PLACES}.`,
      ),
    )
  }

  if (problems.length > 0) {
    return { problems }
  }

  const viewBox = readWords(parsed['viewBox'], 'The viewBox', problems)
  const boxNumbers = viewBox.trim().split(/\s+/).map(Number)

  if (boxNumbers.length !== 4 || boxNumbers.some((each) => !Number.isFinite(each))) {
    problems.push(
      fault(
        'a map file',
        `The viewBox says "${viewBox}". It should be four numbers: the ` +
          `across and down of the top left corner, then the width and the ` +
          `height. For example "0 0 800 600".`,
      ),
    )
  }

  const regions = (rawRegions as unknown[])
    .map((region, at) => readRegion(region, at, problems))
    .filter((region): region is RegionDefinition => region !== null)

  const territories = (rawPlaces as unknown[])
    .map((place, at) => readPlace(place, at, problems))
    .filter((place): place is TerritoryDefinition => place !== null)

  const map: GameMap = {
    id: readWords(parsed['id'], 'The map id', problems),
    name: readWords(parsed['name'], 'The map name', problems),
    viewBox,
    regions,
    territories,
  }

  /**
   * Did every region and place come through whole?
   *
   * A place with no corners is thrown away, and a place with no id cannot
   * be told from any other. Checking the RULES of a map against a map with
   * holes in it invents faults that are not in the file: a border would
   * point at a place that was dropped, and the complaint would name the
   * wrong mistake.
   */
  const wholeMap =
    regions.length === (rawRegions as unknown[]).length &&
    territories.length === (rawPlaces as unknown[]).length &&
    [...regions, ...territories].every((each) => each.id !== '')

  if (!wholeMap) {
    problems.push(
      fault(
        'a map file',
        'The rules of the map have not been checked yet, because parts of ' +
          'this file could not be read at all. Put the above right and load ' +
          'it again.',
      ),
    )

    return { problems }
  }

  // Everything the file says was understood. Now the same ten rules every
  // map we ship has to pass. See spec 3.2.
  //
  // Both lists together, on purpose. A person writing a map wants to see
  // everything that is wrong with it, not one thing per attempt.
  const broken = checkRules ? [...problems, ...validateMap(map)] : problems

  return broken.length > 0 ? { problems: broken } : { map }
}
