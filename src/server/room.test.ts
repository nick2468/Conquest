import { describe, expect, it } from 'vitest'

import type { GameAction } from '../engine'
import { DEFAULT_OPTIONS, legalActions, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import type { Room } from './room'
import {
  CODE_LENGTH,
  computerMoves,
  computerToMove,
  doAction,
  looksLikeACode,
  makeCode,
  openRoom,
  readyToStart,
  seatOf,
  sitDown,
  startGame,
  steppedAway,
  tidyCode,
} from './room'

/**
 * Plan tasks 6.1 to 6.6.
 *
 * A game played across several iPads, tested with no server running and no
 * network anywhere near it. That is the whole point of keeping the thinking
 * out of the Durable Object: these run in milliseconds, and the shell
 * around them has almost nothing in it left to be wrong.
 */

function threeSeats(kinds: readonly ['human' | 'cautious', ...string[]] | string[] = [
  'human',
  'human',
  'cautious',
]): Room {
  return openRoom({
    code: 'ABCD',
    map: AUSTRALIA,
    options: DEFAULT_OPTIONS,
    seed: 42,
    players: kinds.map((kind, at) => ({
      name: `Player ${at + 1}`,
      colour: ['#c8453b', '#2f6fb0', '#e3b62c'][at] as string,
      kind: kind as Room['seats'][number]['kind'],
    })),
  })
}

/** A room with everybody sitting down and the game under way. */
function playing(): Room {
  let room = sitDown(threeSeats(), 'nick', 'Nick').room
  room = sitDown(room, 'james', 'James').room

  return startGame(room, 'nick').room
}

describe('the code people read out to each other', () => {
  it('is four letters long', () => {
    expect(makeCode(seededRandom(1))).toHaveLength(CODE_LENGTH)
  })

  it('never uses a letter that sounds like a number', () => {
    // Somebody reads this out loud across a room. O, I and Z are heard as
    // zero, one and two.
    for (let seed = 0; seed < 200; seed += 1) {
      const code = makeCode(seededRandom(seed))

      expect(code).not.toMatch(/[OIZ]/)
    }
  })

  it('knows what could be a code and what could not', () => {
    expect(looksLikeACode('ABCD')).toBe(true)
    expect(looksLikeACode(' abcd ')).toBe(true)
    expect(looksLikeACode('ABC')).toBe(false)
    expect(looksLikeACode('ABCDE')).toBe(false)
    expect(looksLikeACode('ABIZ')).toBe(false)
  })

  it('tidies up what somebody typed', () => {
    expect(tidyCode('  abcd  ')).toBe('ABCD')
  })
})

describe('sitting down', () => {
  it('puts the first person in the first human seat', () => {
    const { room } = sitDown(threeSeats(), 'nick', 'Nick')

    expect(seatOf(room, 'nick')?.playerId).toBe('p1')
    expect(seatOf(room, 'nick')?.name).toBe('Nick')
    expect(seatOf(room, 'nick')?.here).toBe(true)
  })

  it('never puts anybody in a computer seat', () => {
    let room = sitDown(threeSeats(), 'nick', 'Nick').room
    room = sitDown(room, 'james', 'James').room
    const third = sitDown(room, 'someone', 'Someone')

    expect(third.trouble).toContain('Every seat')
    expect(seatOf(third.room, 'someone')).toBeNull()
  })

  it('gives somebody the SAME seat back when they come again', () => {
    // This is what makes closing the lid and coming back work. A person is
    // known by a key they keep, not by the connection they are on.
    let room = sitDown(threeSeats(), 'nick', 'Nick').room
    room = sitDown(room, 'james', 'James').room
    room = steppedAway(room, 'nick')

    expect(seatOf(room, 'nick')?.here).toBe(false)

    const back = sitDown(room, 'nick', 'Nick')

    expect(seatOf(back.room, 'nick')?.playerId).toBe('p1')
    expect(seatOf(back.room, 'nick')?.here).toBe(true)
    expect(seatOf(back.room, 'james')?.playerId).toBe('p2')
  })

  it('keeps a seat for somebody who has gone away', () => {
    let room = sitDown(threeSeats(), 'nick', 'Nick').room
    room = steppedAway(room, 'nick')

    // Somebody else arriving must NOT be handed the empty chair.
    const other = sitDown(room, 'james', 'James')

    expect(seatOf(other.room, 'james')?.playerId).toBe('p2')
  })

  it('keeps a long name from filling the screen', () => {
    const { room } = sitDown(threeSeats(), 'nick', 'x'.repeat(200))

    expect(seatOf(room, 'nick')?.name.length).toBeLessThanOrEqual(20)
  })
})

describe('starting the game', () => {
  it('will not start until every person is here', () => {
    const room = sitDown(threeSeats(), 'nick', 'Nick').room

    expect(readyToStart(room)).toBe(false)
    expect(startGame(room, 'nick').trouble).toContain('1 more')
    expect(startGame(room, 'nick').room.state).toBeNull()
  })

  it('starts once every human seat is filled', () => {
    let room = sitDown(threeSeats(), 'nick', 'Nick').room
    room = sitDown(room, 'james', 'James').room

    expect(readyToStart(room)).toBe(true)

    const begun = startGame(room, 'nick')

    expect(begun.trouble).toBeNull()
    expect(begun.room.phase).toBe('playing')
    expect(begun.room.state?.players).toHaveLength(3)
  })

  it('lets nobody outside the game start it', () => {
    let room = sitDown(threeSeats(), 'nick', 'Nick').room
    room = sitDown(room, 'james', 'James').room

    expect(startGame(room, 'a stranger').trouble).toContain('Only somebody')
  })

  it('refuses to start twice', () => {
    expect(startGame(playing(), 'nick').trouble).toContain('already started')
  })

  it('gives everybody the same board from the same seed', () => {
    const one = playing()
    const two = playing()

    expect(one.state?.territories).toEqual(two.state?.territories)
  })
})

describe('the server decides, not the player', () => {
  function aLegalMove(room: Room): GameAction {
    return legalActions(room.state!)[0] as GameAction
  }

  it('does what the player whose turn it is asks', () => {
    const room = playing()
    const after = doAction(room, 'nick', aLegalMove(room))

    expect(after.trouble).toBeNull()
    expect(after.room.state).not.toEqual(room.state)
  })

  it('refuses a move from somebody whose turn it is not', () => {
    // The check that matters most. applyAction works on whoever's turn it
    // is, so without this a move sent by the wrong person would be carried
    // out in the RIGHT person's name.
    const room = playing()
    const after = doAction(room, 'james', aLegalMove(room))

    expect(after.trouble).toBe('It is not your turn.')
    expect(after.room.state).toEqual(room.state)
  })

  it('refuses a move from somebody not in the game at all', () => {
    const room = playing()
    const after = doAction(room, 'a stranger', aLegalMove(room))

    expect(after.trouble).toContain('watching this game')
    expect(after.room.state).toEqual(room.state)
  })

  it('refuses a move the rules do not allow, and says why', () => {
    const room = playing()
    const after = doAction(room, 'nick', {
      type: 'attack',
      fromId: 'wa',
      toId: 'tas',
    })

    expect(after.trouble).not.toBeNull()
    expect(after.room.state).toEqual(room.state)
  })

  it('refuses any move before the game has started', () => {
    const room = sitDown(threeSeats(), 'nick', 'Nick').room

    expect(doAction(room, 'nick', { type: 'skipFortify' }).trouble).toContain(
      'not being played',
    )
  })
})

describe('the dice survive the server being restarted', () => {
  it('carries on from where it was, roll for roll', () => {
    // A room is saved and read back between one move and the next. If the
    // dice started again the same seed would stop meaning the same game.
    let straightThrough = playing()
    let restartedEachTime = playing()

    for (let move = 0; move < 25; move += 1) {
      const next = legalActions(straightThrough.state!)[0] as GameAction

      straightThrough = doAction(straightThrough, 'nick', next).room

      // The same room, written out and read back in, as storage does it.
      const saved: Room = JSON.parse(
        JSON.stringify(restartedEachTime),
      ) as Room

      restartedEachTime = doAction(saved, 'nick', next).room
    }

    expect(restartedEachTime.state).toEqual(straightThrough.state)
    expect(restartedEachTime.rolled).toBe(straightThrough.rolled)
    expect(straightThrough.rolled).toBeGreaterThan(0)
  })
})

describe('computer players in a game across iPads', () => {
  it('knows when it is a computer to move', () => {
    let room = playing()

    expect(computerToMove(room)).toBeNull()

    // Hand the turn to the computer seat.
    room = { ...room, state: { ...room.state!, turn: { ...room.state!.turn, playerId: 'p3' } } }

    expect(computerToMove(room)).toBe('cautious')
  })

  it('takes ONE step at a time, so people can watch it', () => {
    const room = {
      ...playing(),
      state: {
        ...playing().state!,
        turn: { ...playing().state!.turn, playerId: 'p3' },
      },
    }

    const after = computerMoves(room)

    expect(after.trouble).toBeNull()
    expect(after.room.state).not.toEqual(room.state)
    expect(after.room.chosen).toBeGreaterThanOrEqual(0)
  })

  it('does nothing when it is a person to move', () => {
    const room = playing()

    expect(computerMoves(room).room).toEqual(room)
  })
})

describe('a room is the sort of thing that can be saved', () => {
  it('survives being written out and read back whole', () => {
    const room = playing()
    const backAgain = JSON.parse(JSON.stringify(room)) as Room

    expect(backAgain).toEqual(room)
  })
})
