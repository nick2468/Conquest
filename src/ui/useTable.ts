import { useCallback, useEffect, useRef, useState } from 'react'

import type { GameAction, GameMap, GameOptions, GameState, PlayerId } from '../engine'
import type { FromPlayer, SentRoom, ToPlayer } from '../server/protocol'
import type { RoomPhase, Seat } from '../server/room'
import { looksLikeACode, tidyCode } from '../server/room'

/**
 * A game played from several iPads at once. Plan tasks 6.3 to 6.5.
 *
 * The screen never works anything out here. It sends what the player wants
 * to do and draws whatever the server sends back, which is the same rule
 * spec S14 already applies to a game on one iPad: the board is built from
 * the state, and nothing on screen is patched by hand.
 */

/**
 * Where the server is.
 *
 * Set at build time. Left empty, "play together" is not offered at all,
 * which is better than offering it and failing.
 */
export const SERVER: string =
  // Written with a DOT, not brackets. Vite replaces the dot form when it
  // builds and leaves the bracket form alone, so the bracket form works
  // while developing and silently does nothing in the built site.
  import.meta.env.VITE_CONQUEST_SERVER ??
  (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '')

/**
 * Who this iPad is, kept between visits.
 *
 * A person is known by this rather than by the connection they happen to be
 * on. That is what lets somebody close the lid, come back, and find their
 * own seat still theirs. See plan task 6.5.
 *
 * It is not a lock. Somebody who knew both this and the game code could
 * take the seat. For a game between a family that is the right trade, and
 * saying so is better than pretending otherwise.
 */
const KEY_KEPT_AS = 'conquest.key'

function myKey(): string {
  try {
    const already = window.localStorage.getItem(KEY_KEPT_AS)

    if (already !== null && already.length > 0) {
      return already
    }

    const fresh = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

    window.localStorage.setItem(KEY_KEPT_AS, fresh)
    return fresh
  } catch {
    // Storage off. The key lasts as long as the page does, so coming back
    // will need a new seat. Better than not playing.
    return `once-${Math.random().toString(36).slice(2, 10)}`
  }
}

export interface TableSetup {
  readonly mapId: string
  /** A map of the player's own, as the file itself. */
  readonly mapFile: string | null
  readonly options: GameOptions
  readonly players: ReadonlyArray<{
    readonly name: string
    readonly colour: string
    readonly kind: string
  }>
}

export interface Table {
  /** The code people read out to each other, or null before there is one. */
  readonly code: string | null
  readonly connected: boolean
  /** Which seat is yours, or null while you are only watching. */
  readonly you: PlayerId | null
  readonly seats: readonly Seat[]
  readonly phase: RoomPhase | null
  readonly map: GameMap | null
  readonly state: GameState | null
  /** How many lines the log really has, before it was cut short for sending. */
  readonly logLength: number
  /** The move just made by anybody, so this iPad can draw it. Task 6.4. */
  readonly lastAction: GameAction | null
  readonly trouble: string | null
  readonly opening: boolean

  open: (setup: TableSetup, name: string) => Promise<void>
  join: (code: string, name: string) => void
  start: () => void
  act: (action: GameAction) => void
  leave: () => void
}

const NOTHING: SentRoom | null = null

export function useTable(): Table {
  const socket = useRef<WebSocket | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [you, setYou] = useState<PlayerId | null>(null)
  const [room, setRoom] = useState<SentRoom | null>(NOTHING)
  const [map, setMap] = useState<GameMap | null>(null)
  const [trouble, setTrouble] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const send = useCallback((message: FromPlayer): void => {
    socket.current?.send(JSON.stringify(message))
  }, [])

  const leave = useCallback((): void => {
    socket.current?.close()
    socket.current = null
    setConnected(false)
    setCode(null)
    setRoom(NOTHING)
    setMap(null)
    setYou(null)
    setTrouble(null)
  }, [])

  /** Connect to a room and sit down in it. */
  const connect = useCallback(
    (wanted: string, name: string): void => {
      socket.current?.close()
      setTrouble(null)
      setRoom(NOTHING)
      setMap(null)

      const address = `${SERVER.replace(/^http/, 'ws')}/room/${wanted}?key=${encodeURIComponent(myKey())}`
      const opened = new WebSocket(address)

      socket.current = opened
      setCode(wanted)

      opened.addEventListener('open', () => {
        setConnected(true)
        opened.send(JSON.stringify({ kind: 'sit', name } satisfies FromPlayer))
      })

      opened.addEventListener('message', (event: MessageEvent<string>) => {
        let told: ToPlayer

        try {
          told = JSON.parse(event.data) as ToPlayer
        } catch {
          return
        }

        if (told.kind === 'trouble') {
          setTrouble(told.message)
          return
        }

        setYou(told.you)
        setRoom(told.room)

        // The map comes once, with the first message. Every message after
        // it leaves the map out, so the board is kept here.
        if (told.room.map !== undefined) {
          setMap(told.room.map)
        }
      })

      opened.addEventListener('close', () => {
        setConnected(false)
      })

      opened.addEventListener('error', () => {
        setTrouble(
          'Could not reach the game. Check the code, and that the other ' +
            'iPad is still on this game.',
        )
      })
    },
    [],
  )

  const open = useCallback(
    async (setup: TableSetup, name: string): Promise<void> => {
      setOpening(true)
      setTrouble(null)

      try {
        const answer = await fetch(`${SERVER}/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapId: setup.mapId,
            mapFile: setup.mapFile,
            options: setup.options,
            players: setup.players,
          }),
        })

        const said = (await answer.json()) as {
          code?: string
          trouble?: string
        }

        if (typeof said.code !== 'string') {
          setTrouble(said.trouble ?? 'The server would not open a game.')
          return
        }

        connect(said.code, name)
      } catch {
        setTrouble('The server did not answer. Is it running?')
      } finally {
        setOpening(false)
      }
    },
    [connect],
  )

  const join = useCallback(
    (wanted: string, name: string): void => {
      const tidy = tidyCode(wanted)

      if (!looksLikeACode(tidy)) {
        setTrouble('A game code is four letters, like ABCD.')
        return
      }

      connect(tidy, name)
    },
    [connect],
  )

  // Close the socket when the page goes, so the seat's light goes out and
  // the others can see somebody has stepped away.
  useEffect(() => () => socket.current?.close(), [])

  return {
    code,
    connected,
    you,
    seats: room?.seats ?? [],
    phase: room?.phase ?? null,
    map,
    state: room?.state ?? null,
    logLength: room?.logLength ?? 0,
    lastAction: room?.lastAction ?? null,
    trouble,
    opening,
    open,
    join,
    start: () => send({ kind: 'start' }),
    act: (action) => send({ kind: 'act', action }),
    leave,
  }
}
