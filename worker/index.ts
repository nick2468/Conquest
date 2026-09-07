import type { GameMap, GameOptions, PlayerKind } from '../src/engine'
import { MAX_PLAYERS, MIN_PLAYERS, seededRandom } from '../src/engine'
import { AUSTRALIA } from '../src/maps/australia'
import { AUSTRALIA_BIG } from '../src/maps/australia-big'
import { readMap } from '../src/maps/format'
import { WORLD } from '../src/maps/world'
import { looksLikeACode, makeCode } from '../src/server/room'
import { GameRoom } from './GameRoom'

/**
 * The server for a game played from several iPads. Plan phase 6.
 *
 * There is almost nothing in this file, and that is on purpose. Every rule
 * about who may do what lives in `src/server/room.ts`, which runs on the
 * ordinary test bar with no server anywhere near it. This only finds the
 * right room and hands the message over.
 *
 * It runs the SAME engine the iPads run. That is what spec S2 bought: the
 * engine touches no browser, no clock and no hidden randomness, so it runs
 * unchanged in a place with none of those things.
 */

export { GameRoom }

export interface Env {
  readonly ROOMS: DurableObjectNamespace
}

/**
 * Who may talk to this server.
 *
 * A game code is four letters, so somebody could guess one. That is fine
 * for a family game and it is not what this list is for: it stops a page
 * on some other website from quietly opening games on Nick's account.
 */
const ALLOWED = [
  'https://conquest.datacrafter.net',
  'http://localhost:5180',
  'http://localhost:5181',
]

function allowing(request: Request): Record<string, string> {
  const from = request.headers.get('Origin') ?? ''

  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(from) ? from : ALLOWED[0]!,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function said(
  body: unknown,
  request: Request,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...allowing(request) },
  })
}

/** The maps this server knows by name, so a code carries no 23 kB of map. */
const KNOWN: Record<string, GameMap> = {
  world: WORLD,
  'australia-big': AUSTRALIA_BIG,
  australia: AUSTRALIA,
}

interface OpeningRequest {
  readonly mapId?: unknown
  readonly mapFile?: unknown
  readonly options?: unknown
  readonly players?: unknown
}

/** What somebody asked to open, checked before any of it is believed. */
function readOpening(body: OpeningRequest):
  | { readonly map: GameMap; readonly players: ReadonlyArray<{ name: string; colour: string; kind: PlayerKind }>; readonly options: GameOptions }
  | { readonly trouble: string } {
  const players = Array.isArray(body.players) ? body.players : []

  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    return {
      trouble: `A game needs between ${MIN_PLAYERS} and ${MAX_PLAYERS} players.`,
    }
  }

  // A map of your own comes as the file itself, and is read by exactly the
  // same reader the game uses, faults and all. See plan task 5.5.
  const map =
    typeof body.mapFile === 'string'
      ? readMap(body.mapFile).map
      : KNOWN[typeof body.mapId === 'string' ? body.mapId : 'world']

  if (map === undefined) {
    return { trouble: 'That map could not be read.' }
  }

  return {
    map,
    options: body.options as GameOptions,
    players: players.map((player: Record<string, unknown>, at: number) => ({
      name: typeof player['name'] === 'string' ? player['name'] : `Player ${at + 1}`,
      colour: typeof player['colour'] === 'string' ? player['colour'] : '#c8453b',
      kind: (typeof player['kind'] === 'string' ? player['kind'] : 'human') as PlayerKind,
    })),
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: allowing(request) })
    }

    // Open a room and hand back the code people read out to each other.
    if (url.pathname === '/new' && request.method === 'POST') {
      const opening = readOpening((await request.json()) as OpeningRequest)

      if ('trouble' in opening) {
        return said({ trouble: opening.trouble }, request, 400)
      }

      // Try a few codes. A taken one is rare, and trying again is cheaper
      // than keeping a list of every room ever opened.
      for (let go = 0; go < 8; go += 1) {
        const code = makeCode(seededRandom((Date.now() + go * 7919) | 0))
        const room = env.ROOMS.get(env.ROOMS.idFromName(code))
        const answer = await room.fetch(
          new Request('https://room/open', {
            method: 'POST',
            body: JSON.stringify({ code, ...opening }),
          }),
        )

        if (answer.ok) {
          return said({ code }, request)
        }
      }

      return said({ trouble: 'Could not open a room. Try again.' }, request, 503)
    }

    // Join a room. From here on it is a socket, and the room does the rest.
    const joining = /^\/room\/([A-Za-z]{4})$/.exec(url.pathname)

    if (joining !== null && looksLikeACode(joining[1] as string)) {
      const code = (joining[1] as string).toUpperCase()
      const room = env.ROOMS.get(env.ROOMS.idFromName(code))
      const inside = new URL('https://room/join')

      inside.searchParams.set('code', code)

      // The key has to come through. It is how somebody who closed the lid
      // gets their OWN seat back rather than a new one. Building a fresh
      // URL and forgetting to carry it was a real bug: coming back was
      // told the game was full.
      const key = url.searchParams.get('key')

      if (key !== null && key.length > 0 && key.length <= 100) {
        inside.searchParams.set('key', key)
      }

      return room.fetch(new Request(inside.toString(), request))
    }

    return said({ trouble: 'No such thing here.' }, request, 404)
  },
}
