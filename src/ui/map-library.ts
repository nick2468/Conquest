import type { GameMap } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import { readMap } from '../maps/format'
import type { MapProblem } from '../maps/validate'

/**
 * The maps a player may pick. Plan task 5.7.
 *
 * Two are built in. A third appears once a player loads one of their own,
 * and is remembered, so choosing the file is a thing you do once rather
 * than every time the game starts.
 *
 * The choosing is worked out here with no React and no browser, so it is
 * tested. Only the remembering touches the browser, and it is wrapped, so a
 * browser with storage switched off simply forgets.
 */

export const BUILT_IN: readonly GameMap[] = [AUSTRALIA_BIG, AUSTRALIA]

export interface MapChoice {
  readonly map: GameMap
  /** True when the player loaded this one from a file of their own. */
  readonly fromFile: boolean
}

/**
 * Every map a player may pick, in the order they are offered.
 *
 * A loaded map goes last, and it REPLACES a built-in one with the same id.
 * Two maps with one id would make the list say the same thing twice, and
 * the game would have no way to tell which one was meant.
 */
export function mapChoices(loaded: GameMap | null): MapChoice[] {
  const built = BUILT_IN.map((map) => ({ map, fromFile: false }))

  if (loaded === null) {
    return built
  }

  return [
    ...built.filter((choice) => choice.map.id !== loaded.id),
    { map: loaded, fromFile: true },
  ]
}

/** What to call a map in the list. */
export function labelFor(choice: MapChoice): string {
  const places = `${choice.map.territories.length} places`

  return choice.fromFile
    ? `${choice.map.name}, ${places}, your own`
    : `${choice.map.name}, ${places}`
}

/**
 * The map with this id, or the first one if there is no such map.
 *
 * Never returns nothing. A missing map would leave the new game screen with
 * no board at all, and the player with nothing to do about it.
 */
export function mapCalled(id: string, loaded: GameMap | null): GameMap {
  const choices = mapChoices(loaded)

  return (
    choices.find((choice) => choice.map.id === id)?.map ??
    (choices[0] as MapChoice).map
  )
}

/** What came back from a player choosing a file. */
export type MapLoad =
  | { readonly map: GameMap; readonly problems?: undefined }
  | { readonly map?: undefined; readonly problems: MapProblem[] }

const REMEMBERED_AS = 'conquest.map'

/** More than any honest map, and small enough not to fill up storage. */
const MOST_TO_REMEMBER = 1_000_000

/**
 * Take a map file a player chose, and remember it for next time.
 *
 * A file that does not read is not remembered, and does not disturb the one
 * already there. A player who picks the wrong file by mistake loses
 * nothing.
 */
export function loadMap(text: string): MapLoad {
  const read = readMap(text)

  if (read.problems !== undefined) {
    return { problems: read.problems }
  }

  try {
    if (text.length <= MOST_TO_REMEMBER) {
      window.localStorage.setItem(REMEMBERED_AS, text)
    }
  } catch {
    // Storage may be switched off. The map still works for this game.
  }

  return { map: read.map }
}

/**
 * The map this player loaded last time, if there is one.
 *
 * Checked again on the way in, not trusted. A map that was fine when it was
 * saved may not be fine after the rules of a map change, and a stored map
 * that broke the game on startup would leave a player with no way back in.
 */
export function mapRemembered(): GameMap | null {
  try {
    const text = window.localStorage.getItem(REMEMBERED_AS)

    if (text === null) {
      return null
    }

    return readMap(text).map ?? null
  } catch {
    return null
  }
}

/** Forget the loaded map. */
export function forgetMap(): void {
  try {
    window.localStorage.removeItem(REMEMBERED_AS)
  } catch {
    // Nothing to do about it.
  }
}
