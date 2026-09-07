import type { GameAction, GameMap, GameState, PlayerId } from '../engine'
import type { Room, RoomPhase, Seat } from './room'

/**
 * What travels between an iPad and the server. Plan task 6.3.
 *
 * Both sides import this one file, so the two cannot drift apart. The
 * shapes are plain data with no behaviour, because everything here goes
 * through `JSON.stringify` and comes out the other end as plain data
 * whatever it started as.
 */

/** What a player sends. */
export type FromPlayer =
  | { readonly kind: 'sit'; readonly name: string }
  | { readonly kind: 'start' }
  | { readonly kind: 'act'; readonly action: GameAction }

/**
 * A room as it goes over the wire.
 *
 * The map is sent ONCE, when a player first connects, and left out of every
 * message after that. The world map is 23 kB, and sending it again with
 * every army placed would be most of the traffic in a game.
 */
export interface SentRoom {
  readonly code: string
  readonly phase: RoomPhase
  readonly seats: readonly Seat[]
  readonly state: GameState | null
  readonly map?: GameMap
  /** How many lines the log really has, before it was cut short. */
  readonly logLength: number
  /** The move just made, so the other iPads can draw it. Task 6.4. */
  readonly lastAction: GameAction | null
}

/** What the server sends. */
export type ToPlayer =
  | {
      readonly kind: 'room'
      /** Which seat this is, or null for somebody watching. */
      readonly you: PlayerId | null
      readonly room: SentRoom
    }
  | { readonly kind: 'trouble'; readonly message: string }

/**
 * How much of the log to send.
 *
 * The screen draws 60 lines and says how many came before. One real game
 * reached 4057 lines, which is a third of a megabyte, and sending it after
 * every single move would be silly. So the tail is sent and the true count
 * goes with it, and the screen can still say "and 3,997 earlier" truthfully.
 */
export const LINES_SENT = 80

/** Cut a room down to what is worth sending. */
export function forSending(room: Room, withMap: boolean): SentRoom {
  const log = room.state?.log ?? []

  return {
    code: room.code,
    phase: room.phase,
    seats: room.seats,
    logLength: log.length,
    lastAction: room.lastAction,
    state:
      room.state === null
        ? null
        : { ...room.state, log: log.slice(-LINES_SENT) },
    ...(withMap ? { map: room.map } : {}),
  }
}

/**
 * Read what came off the wire, and refuse anything that is not one of ours.
 *
 * Returns null rather than throwing. A message from outside the game is not
 * an error in our code, it is somebody sending rubbish, and the answer is
 * to ignore it rather than to fall over.
 */
export function readFromPlayer(text: string): FromPlayer | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const message = parsed as Record<string, unknown>

  if (message['kind'] === 'start') {
    return { kind: 'start' }
  }

  if (message['kind'] === 'sit') {
    return {
      kind: 'sit',
      name: typeof message['name'] === 'string' ? message['name'] : '',
    }
  }

  if (message['kind'] === 'act') {
    const action = message['action']

    if (
      typeof action === 'object' &&
      action !== null &&
      typeof (action as { type?: unknown }).type === 'string'
    ) {
      return { kind: 'act', action: action as GameAction }
    }
  }

  return null
}
