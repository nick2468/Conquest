import type { GameOptions, NewPlayer, PlayerKind } from '../engine'
import {
  ALL_SKILLS,
  RISING_SET_CAP_CHOICES,
  DEFAULT_OPTIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOURS,
} from '../engine'

/**
 * The new game screen, as it was left. Plan task 4.21.
 *
 * Nick: "Can option selections be persisted in a cookie?" They are kept in
 * the browser's own storage on the iPad instead. A cookie is sent to the
 * server with every request and can run out; this stays on the iPad, works
 * with no internet, and is where the game already keeps a map you loaded.
 *
 * Everything read back is checked. A stored game from an older version, or
 * one damaged some other way, must never stop the game from opening, so
 * anything that does not make sense is quietly replaced by the default.
 */

const KEY = 'conquest.setup'

export interface RememberedSetup {
  readonly players: readonly NewPlayer[]
  readonly options: GameOptions
  readonly mapId: string
}

/** Somewhere to keep it: the browser's storage, or a stand-in in a test. */
export interface SetupStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStore(): SetupStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Some browsers refuse storage altogether in a private window.
    return null
  }
}

export function rememberSetup(
  setup: RememberedSetup,
  store: SetupStore | null = browserStore(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify(setup))
  } catch {
    // Storage full or refused. Forgetting the choices is not worth a fault.
  }
}

/** What each option may be. Anything else read back is ignored. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  cardSetValue: ['fixed', 'rising'],
  fortifyDistance: ['adjacent', 'connected'],
  fortifyMoves: ['one', 'many'],
  armyPlacement: ['automatic', 'byHand'],
  diceDisplay: ['oneByOne', 'allAtOnce'],
  cardTrading: ['classic', 'afterKnockout', 'anyTime'],
}

export function recallSetup(
  store: SetupStore | null = browserStore(),
): RememberedSetup | null {
  let stored: unknown

  try {
    const text = store?.getItem(KEY)

    if (text === null || text === undefined || text === '') {
      return null
    }
    stored = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof stored !== 'object' || stored === null) {
    return null
  }

  const { players, options, mapId } = stored as Record<string, unknown>

  if (
    !Array.isArray(players) ||
    players.length < MIN_PLAYERS ||
    players.length > MAX_PLAYERS
  ) {
    return null
  }

  const kinds: readonly string[] = ['human', ...ALL_SKILLS]
  const seats: NewPlayer[] = []

  for (const [index, each] of players.entries()) {
    if (typeof each !== 'object' || each === null) {
      return null
    }

    const { name, kind, colour } = each as Record<string, unknown>

    if (typeof name !== 'string' || typeof kind !== 'string' || !kinds.includes(kind)) {
      return null
    }

    seats.push({
      name: name.slice(0, 16),
      kind: kind as PlayerKind,
      colour:
        typeof colour === 'string' && PLAYER_COLOURS.includes(colour)
          ? colour
          : (PLAYER_COLOURS[index] as string),
    })
  }

  const chosen: Record<string, unknown> = { ...DEFAULT_OPTIONS }

  if (typeof options === 'object' && options !== null) {
    for (const [key, allowed] of Object.entries(ALLOWED)) {
      const value = (options as Record<string, unknown>)[key]

      if (typeof value === 'string' && allowed.includes(value)) {
        chosen[key] = value
      }
    }

    // The one option that is a number, not a word.
    const cap = (options as Record<string, unknown>).risingSetCap

    if (typeof cap === 'number' && RISING_SET_CAP_CHOICES.includes(cap)) {
      chosen.risingSetCap = cap
    }
  }

  return {
    players: seats,
    options: chosen as unknown as GameOptions,
    mapId: typeof mapId === 'string' && mapId !== '' ? mapId : 'world',
  }
}
