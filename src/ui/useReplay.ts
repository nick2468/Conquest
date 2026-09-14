import { useCallback, useEffect, useRef, useState } from 'react'

import type { GameState, RandomSource, Recording } from '../engine'
import { applyAction, seededRandom } from '../engine'

/**
 * Watching a finished game again. Plan task 4.55.
 *
 * Nick: "I mostly just want to rewatch how the player colours coalesce over
 * time until there is one winner", and "moves will be nicer to watch, by
 * turns will be a bit jerky."
 *
 * So a frame is one MOVE. The map then flows: armies gather, a border gives
 * way, a colour spreads. Whole turns were tried first and he is right that
 * they jump.
 *
 * **No board is ever stored.** The engine is pure and the dice come from a
 * seeded source, so the board at any point is worked out by doing the
 * actions again. Going forward one frame costs one action. Going backwards
 * replays from the start, which is a few milliseconds for a whole game and
 * only happens when somebody drags the slider.
 *
 * That last point is why the cursor lives in a ref rather than in React
 * state: the random source carries its own position, so it must be the same
 * object from one frame to the next, and a re-render must not rewind it.
 */

/** How fast to play, in moves a second. */
export const SPEEDS = [5, 12, 25, 50] as const

export type Speed = (typeof SPEEDS)[number]

interface Cursor {
  at: number
  board: GameState
  random: RandomSource
}

export interface Replay {
  /** True while the replay is showing, so the live game steps aside. */
  readonly watching: boolean
  /** The board to draw, or null when the live game should be drawn. */
  readonly showing: GameState | null
  /** Which move, counting from zero. */
  readonly at: number
  /** How many moves the game took. */
  readonly last: number
  readonly playing: boolean
  readonly speed: Speed
  readonly start: () => void
  readonly stop: () => void
  readonly goTo: (move: number) => void
  readonly setPlaying: (playing: boolean) => void
  readonly setSpeed: (speed: Speed) => void
}

export function useReplay(recording: Recording, diceSeed: number): Replay {
  const [watching, setWatching] = useState(false)
  const [showing, setShowing] = useState<GameState | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(25)

  const cursor = useRef<Cursor | null>(null)
  const last = recording.actions.length

  /** Wind to this move, forwards a step at a time, backwards from the start. */
  const seek = useCallback(
    (target: number) => {
      const wanted = Math.max(0, Math.min(target, recording.actions.length))
      let here = cursor.current

      if (here === null || wanted < here.at) {
        here = {
          at: 0,
          board: recording.first,
          random: seededRandom(diceSeed),
        }
      }

      while (here.at < wanted) {
        here.board = applyAction(
          here.board,
          recording.actions[here.at] as Parameters<typeof applyAction>[1],
          here.random,
        )
        here.at += 1
      }

      cursor.current = here
      setShowing(here.board)
      setAt(here.at)
    },
    [recording, diceSeed],
  )

  // Play on a timer, stopping at the end rather than looping: the last move
  // is the winning one, and that is the thing worth landing on.
  useEffect(() => {
    if (!watching || !playing || at >= last) {
      return
    }

    const timer = setTimeout(() => seek(at + 1), 1000 / speed)

    return () => clearTimeout(timer)
  }, [watching, playing, at, last, speed, seek])

  useEffect(() => {
    if (playing && at >= last) {
      setPlaying(false)
    }
  }, [playing, at, last])

  const start = useCallback(() => {
    cursor.current = null
    seek(0)
    setPlaying(true)
    setWatching(true)
  }, [seek])

  const stop = useCallback(() => {
    setWatching(false)
    setPlaying(false)
    setShowing(null)
    cursor.current = null
    setAt(0)
  }, [])

  const goTo = useCallback(
    (move: number) => {
      setPlaying(false)
      seek(move)
    },
    [seek],
  )

  return {
    watching,
    showing: watching ? showing : null,
    at,
    last,
    playing,
    speed,
    start,
    stop,
    goTo,
    setPlaying,
    setSpeed,
  }
}
