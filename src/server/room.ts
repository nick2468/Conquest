import type {
  GameAction,
  GameMap,
  GameOptions,
  GameState,
  PlayerId,
  PlayerKind,
  Skill,
} from '../engine'
import {
  IllegalActionError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyAction,
  createGame,
  playerFor,
  seededRandom,
} from '../engine'

/**
 * One game, played from several iPads at once. Plan tasks 6.1 to 6.6.
 *
 * All of the thinking is here, and none of the network. This file knows
 * nothing about Cloudflare, sockets or storage, so every rule in it is
 * tested the way the game rules are, in milliseconds and with no server
 * running. The Durable Object in `worker/` is a thin shell that keeps this
 * in a box and passes messages to it.
 *
 * **The server is the one that decides.** A player sends what they want to
 * do, and the server works out what happens. It never takes a state from a
 * player. That is not about mistrust between Nick and James: it is that two
 * iPads acting at once would otherwise end up holding two different games,
 * and there would be no way to say which was right.
 */

/** How a room is doing. */
export type RoomPhase = 'waiting' | 'playing' | 'finished'

/** One seat at the table. */
export interface Seat {
  readonly playerId: PlayerId
  readonly name: string
  readonly colour: string
  readonly kind: PlayerKind
  /**
   * Who is sitting here, or null for an empty seat.
   *
   * A person keeps their key when they close the lid, so coming back puts
   * them in the same seat rather than a new one. See plan task 6.5.
   */
  readonly heldBy: string | null
  /** True while that person's iPad is actually connected. */
  readonly here: boolean
}

/** Everything a room is. This is what gets saved and read back. */
export interface Room {
  readonly code: string
  readonly phase: RoomPhase
  readonly map: GameMap
  readonly options: GameOptions
  readonly seats: readonly Seat[]
  readonly state: GameState | null
  /** The seed the game was dealt from. */
  readonly seed: number
  /** How many dice have been rolled, so a restart carries on. */
  readonly rolled: number
  /** How many choices computer players have made, for the same reason. */
  readonly chosen: number
  /**
   * The move just made, whoever made it.
   *
   * This is what lets somebody on another iPad SEE what happened rather
   * than only read it: the smoke, the parachutes and the convoy of phase 7
   * are worked out from the action, and without this the other iPads would
   * have nothing to work them out from. See plan task 6.4.
   */
  readonly lastAction: GameAction | null
}

/** What a player asks the room to do. */
export type Ask =
  | { readonly kind: 'sit'; readonly key: string; readonly name: string }
  | { readonly kind: 'start'; readonly key: string }
  | {
      readonly kind: 'act'
      readonly key: string
      readonly action: GameAction
    }

/** What the room sends back. */
export interface Told {
  readonly room: Room
  /** Something to say to the one who asked, if anything went wrong. */
  readonly trouble: string | null
}

/**
 * The letters a room code is made of.
 *
 * No O, I, or Z. Somebody reads this code out loud to somebody else across
 * a room, and those three are heard as zero, one and two.
 */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXY'

/** How long a code is. Four is 279,841 rooms, which is plenty. */
export const CODE_LENGTH = 4

/** Make a room code out of numbers from a random source. */
export function makeCode(random: { nextInt: (max: number) => number }): string {
  let code = ''

  for (let letter = 0; letter < CODE_LENGTH; letter += 1) {
    code += CODE_LETTERS[random.nextInt(CODE_LETTERS.length)]
  }

  return code
}

/** Is this something that could be a room code? */
export function looksLikeACode(text: string): boolean {
  const tidy = text.trim().toUpperCase()

  return (
    tidy.length === CODE_LENGTH &&
    [...tidy].every((letter) => CODE_LETTERS.includes(letter))
  )
}

/** What a person types, turned into what the room is called. */
export function tidyCode(text: string): string {
  return text.trim().toUpperCase()
}

export interface NewRoom {
  readonly code: string
  readonly map: GameMap
  readonly options: GameOptions
  readonly seed: number
  readonly players: ReadonlyArray<{
    readonly name: string
    readonly colour: string
    readonly kind: PlayerKind
  }>
}

/** Open a room. Nobody is sitting down yet. */
export function openRoom(opening: NewRoom): Room {
  return {
    code: opening.code,
    phase: 'waiting',
    map: opening.map,
    options: opening.options,
    seed: opening.seed,
    rolled: 0,
    chosen: 0,
    lastAction: null,
    state: null,
    seats: opening.players.map((player, at) => ({
      playerId: `p${at + 1}`,
      name: player.name,
      colour: player.colour,
      kind: player.kind,
      heldBy: null,
      here: false,
    })),
  }
}

function changingSeat(
  room: Room,
  playerId: PlayerId,
  changes: Partial<Seat>,
): Room {
  return {
    ...room,
    seats: room.seats.map((seat) =>
      seat.playerId === playerId ? { ...seat, ...changes } : seat,
    ),
  }
}

/** The seat this person is in, if they are in one. */
export function seatOf(room: Room, key: string): Seat | null {
  return room.seats.find((seat) => seat.heldBy === key) ?? null
}

/**
 * Sit somebody down.
 *
 * Somebody already holding a seat gets that same seat back, however many
 * times they ask. That is what makes closing the lid and coming back work,
 * and it is why a person is known by a key they keep rather than by the
 * connection they happen to be on. See plan task 6.5.
 */
export function sitDown(room: Room, key: string, name: string): Told {
  const already = seatOf(room, key)

  if (already !== null) {
    return { room: changingSeat(room, already.playerId, { here: true }), trouble: null }
  }

  const free = room.seats.find(
    (seat) => seat.kind === 'human' && seat.heldBy === null,
  )

  if (free === undefined) {
    return {
      room,
      trouble:
        'Every seat in this game is taken. Ask them to start a new one with ' +
        'more players.',
    }
  }

  const wanted = name.trim().slice(0, 20)

  return {
    room: changingSeat(room, free.playerId, {
      heldBy: key,
      here: true,
      ...(wanted === '' ? {} : { name: wanted }),
    }),
    trouble: null,
  }
}

/** Somebody's iPad went away. Their seat is kept for them. */
export function steppedAway(room: Room, key: string): Room {
  const seat = seatOf(room, key)

  return seat === null ? room : changingSeat(room, seat.playerId, { here: false })
}

/** Is everybody who needs to be here, here? */
export function readyToStart(room: Room): boolean {
  return (
    room.phase === 'waiting' &&
    room.seats.length >= MIN_PLAYERS &&
    room.seats.length <= MAX_PLAYERS &&
    room.seats.every((seat) => seat.kind !== 'human' || seat.heldBy !== null)
  )
}

/**
 * Deal the board and begin.
 *
 * Only somebody sitting at the table may start it, and only when every
 * person's seat is filled. Starting with an empty human seat would deal
 * armies to somebody who is not there, and the game would stop on their
 * turn and never move again.
 */
export function startGame(room: Room, key: string): Told {
  if (room.phase !== 'waiting') {
    return { room, trouble: 'This game has already started.' }
  }

  if (seatOf(room, key) === null) {
    return { room, trouble: 'Only somebody in the game can start it.' }
  }

  if (!readyToStart(room)) {
    const waitingFor = room.seats.filter(
      (seat) => seat.kind === 'human' && seat.heldBy === null,
    ).length

    return {
      room,
      trouble: `Still waiting for ${waitingFor} more to join.`,
    }
  }

  const dealer = seededRandom(room.seed)

  return {
    trouble: null,
    room: {
      ...room,
      phase: 'playing',
      state: createGame({
        map: room.map,
        options: room.options,
        random: dealer,
        players: room.seats.map((seat) => ({
          name: seat.name,
          colour: seat.colour,
          kind: seat.kind,
        })),
      }),
    },
  }
}

/**
 * Do what a player asked, if it is their turn and the rules allow it.
 *
 * Two checks, and the order matters. First that it is their turn, because
 * `applyAction` works on whoever's turn it is: an action sent by the wrong
 * person would otherwise be carried out in the RIGHT person's name. Then
 * that the rules allow it, which the engine decides and this does not.
 */
export function doAction(room: Room, key: string, action: GameAction): Told {
  if (room.phase !== 'playing' || room.state === null) {
    return { room, trouble: 'This game is not being played.' }
  }

  const seat = seatOf(room, key)

  if (seat === null) {
    return { room, trouble: 'You are watching this game, not playing it.' }
  }

  if (seat.playerId !== room.state.turn.playerId) {
    return { room, trouble: 'It is not your turn.' }
  }

  return carryOut(room, action)
}

/** Change the game by one action, whoever asked for it. */
function carryOut(room: Room, action: GameAction): Told {
  if (room.state === null) {
    return { room, trouble: 'This game is not being played.' }
  }

  const dice = seededRandom(room.seed * 7919 + 13, room.rolled)

  try {
    const after = applyAction(room.state, action, dice)

    return {
      trouble: null,
      room: {
        ...room,
        state: after,
        rolled: dice.drawn,
        lastAction: action,
        phase: after.winnerId === null ? 'playing' : 'finished',
      },
    }
  } catch (trouble) {
    if (trouble instanceof IllegalActionError) {
      return { room, trouble: trouble.message }
    }

    throw trouble
  }
}

/** Whose turn is it, and are they a computer? */
export function computerToMove(room: Room): Skill | null {
  if (room.phase !== 'playing' || room.state === null) {
    return null
  }

  const seat = room.seats.find(
    (each) => each.playerId === room.state?.turn.playerId,
  )

  return seat !== undefined && seat.kind !== 'human' ? seat.kind : null
}

/**
 * Let a computer player take one step. Plan task 6.6.
 *
 * One step, not a whole turn. The room sends the new state out after each
 * one, so the people watching see a computer play at the same speed they
 * would on their own iPad rather than in one jump.
 *
 * The chooser is separate from the dice, exactly as it is in a game played
 * on one iPad. If a computer drew from the same source, adding an opponent
 * would change every roll in the game.
 */
export function computerMoves(room: Room): Told {
  const skill = computerToMove(room)

  if (skill === null || room.state === null) {
    return { room, trouble: null }
  }

  const chooser = seededRandom(room.seed * 104729 + 5, room.chosen)
  const action = playerFor(skill).chooseAction(room.state, chooser)
  const after = carryOut({ ...room, chosen: chooser.drawn }, action)

  return after
}
