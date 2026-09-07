import type { GameMap, GameOptions, PlayerKind } from '../src/engine'
import type { ToPlayer } from '../src/server/protocol'
import { forSending, readFromPlayer } from '../src/server/protocol'
import type { Room } from '../src/server/room'
import {
  computerMoves,
  computerToMove,
  doAction,
  openRoom,
  seatOf,
  sitDown,
  startGame,
  steppedAway,
} from '../src/server/room'

/**
 * One game, held by the server. Plan tasks 6.1, 6.4 and 6.5.
 *
 * A Durable Object is a small box that Cloudflare guarantees there is only
 * ONE of, anywhere in the world, for a given name. The name here is the
 * game code. That is the whole reason for using one: two iPads cannot both
 * be the one deciding what happened, and this makes sure they never are.
 *
 * There is no thinking in this file. Every rule lives in
 * `src/server/room.ts`, which is tested with no server running. This keeps
 * the room in storage, keeps the sockets, and passes messages along.
 */

/** How long a computer player waits between its moves, in milliseconds. */
const COMPUTER_PAUSE = 900

/** After a fight, longer, because the dice are worth reading. */
const PAUSE_AFTER_A_FIGHT = 1600

/** A room nobody has touched for this long is forgotten. */
const FORGET_AFTER = 1000 * 60 * 60 * 24

interface Sitting {
  /** Who this connection belongs to. Kept when they close the lid. */
  readonly key: string
  /** True once the map has been sent, so it is never sent twice. */
  readonly hasMap: boolean
}

export class GameRoom implements DurableObject {
  readonly #ctx: DurableObjectState

  constructor(ctx: DurableObjectState) {
    this.#ctx = ctx
  }

  async #read(): Promise<Room | null> {
    return (await this.#ctx.storage.get<Room>('room')) ?? null
  }

  async #write(room: Room): Promise<void> {
    await this.#ctx.storage.put('room', room)
    await this.#ctx.storage.put('touched', Date.now())
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/open') {
      return this.#open(request)
    }

    if (url.pathname === '/join') {
      return this.#join(request)
    }

    return new Response('No such thing here.', { status: 404 })
  }

  /** Open a room, unless this code is already somebody else's game. */
  async #open(request: Request): Promise<Response> {
    if ((await this.#read()) !== null) {
      return new Response('That code is taken.', { status: 409 })
    }

    const opening = (await request.json()) as {
      code: string
      map: GameMap
      options: GameOptions
      players: ReadonlyArray<{ name: string; colour: string; kind: PlayerKind }>
    }

    await this.#write(
      openRoom({
        code: opening.code,
        map: opening.map,
        options: opening.options,
        players: opening.players,
        // The seed decides the whole board and every roll. It is chosen
        // here rather than by a player, so nobody can deal themselves a
        // board they have seen before.
        seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0,
      }),
    )

    return new Response('Opened.', { status: 201 })
  }

  /** Somebody's iPad wants to watch and play. */
  async #join(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('This is a socket, not a page.', { status: 426 })
    }

    if ((await this.#read()) === null) {
      return new Response('No game with that code.', { status: 404 })
    }

    const pair = new WebSocketPair()
    const [forThem, forUs] = Object.values(pair) as [WebSocket, WebSocket]

    // Hibernation. Cloudflare may put this object to sleep between moves
    // and wake it when something arrives, and the sockets stay open across
    // that. A game left open on an iPad overnight costs nothing.
    this.#ctx.acceptWebSocket(forUs)

    const key =
      new URL(request.url).searchParams.get('key') ?? crypto.randomUUID()

    forUs.serializeAttachment({ key, hasMap: false } satisfies Sitting)

    return new Response(null, { status: 101, webSocket: forThem })
  }

  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== 'string') {
      return
    }

    const asked = readFromPlayer(message)
    const sitting = socket.deserializeAttachment() as Sitting | null

    if (asked === null || sitting === null) {
      return
    }

    const room = await this.#read()

    if (room === null) {
      return
    }

    const told =
      asked.kind === 'sit'
        ? sitDown(room, sitting.key, asked.name)
        : asked.kind === 'start'
          ? startGame(room, sitting.key)
          : doAction(room, sitting.key, asked.action)

    if (told.trouble !== null) {
      this.#say(socket, { kind: 'trouble', message: told.trouble })
    }

    if (told.room !== room) {
      await this.#write(told.room)
      await this.#tellEverybody(told.room)
      await this.#nudgeTheComputer(told.room)
    } else if (asked.kind === 'sit') {
      // Nothing changed, but this person still needs to see the board.
      await this.#tellEverybody(told.room)
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const sitting = socket.deserializeAttachment() as Sitting | null
    const room = await this.#read()

    if (sitting === null || room === null) {
      return
    }

    // The SEAT is kept. Only the little light saying they are here goes
    // out. See plan task 6.5.
    const after = steppedAway(room, sitting.key)

    await this.#write(after)
    await this.#tellEverybody(after)
  }

  /** A computer player's turn to move. */
  async alarm(): Promise<void> {
    const room = await this.#read()

    if (room === null) {
      return
    }

    const wasAFight = room.state?.log.at(-1)?.text.includes('rolls') === true
    const after = computerMoves(room)

    if (after.room === room) {
      return
    }

    await this.#write(after.room)
    await this.#tellEverybody(after.room)
    await this.#nudgeTheComputer(after.room, wasAFight)
  }

  /** If a computer is to move, book it in for a moment from now. */
  async #nudgeTheComputer(room: Room, afterAFight = false): Promise<void> {
    if (computerToMove(room) === null) {
      await this.#ctx.storage.deleteAlarm()
      await this.#ctx.storage.setAlarm(Date.now() + FORGET_AFTER)
      return
    }

    await this.#ctx.storage.setAlarm(
      Date.now() + (afterAFight ? PAUSE_AFTER_A_FIGHT : COMPUTER_PAUSE),
    )
  }

  #say(socket: WebSocket, message: ToPlayer): void {
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // The other end has gone. webSocketClose will tidy up.
    }
  }

  /** Send the board to everybody watching, each seeing their own seat. */
  async #tellEverybody(room: Room): Promise<void> {
    for (const socket of this.#ctx.getWebSockets()) {
      const sitting = socket.deserializeAttachment() as Sitting | null

      if (sitting === null) {
        continue
      }

      this.#say(socket, {
        kind: 'room',
        you: seatOf(room, sitting.key)?.playerId ?? null,
        room: forSending(room, !sitting.hasMap),
      })

      if (!sitting.hasMap) {
        socket.serializeAttachment({ ...sitting, hasMap: true })
      }
    }
  }
}
