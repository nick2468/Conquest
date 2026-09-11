import { useEffect, useState } from 'react'

import type { AttackOutcome, GameOptions } from '../engine'

/**
 * Big dice under the board, that tumble before they land. Plan task 4.27.
 *
 * Nick: "Show some prominent dice, above or below the board, and if
 * possible make them look like real rolling dice or in place spinning dice.
 * Keep the dice roll commentary box as it is." The small dice and the words
 * in the turn panel stay exactly as they were. These are for looking at.
 *
 * Like the small dice, this changes nothing about the result. The engine
 * has already rolled. See spec section 7.
 */

interface BoardDiceProps {
  readonly outcome: AttackOutcome
  readonly display: GameOptions['diceDisplay']
}

/** How long the dice tumble before the first one lands. */
const ROLL_TIME = 650

/** How often a tumbling die shows a new face. */
const FLICKER = 70

/** The gap between dice landing, when they come one at a time. */
const PAUSE = 260

/**
 * Where the pips go on each face, as cells of a three by three grid:
 *
 *   1 2 3
 *   4 5 6
 *   7 8 9
 */
const PIPS: Readonly<Record<number, readonly number[]>> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

const CELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export type DieResult = 'won' | 'lost' | null

/**
 * Which dice won their fight. Both sides are sorted high to low, and the
 * highest of each are compared, then the next highest. A tie goes to the
 * defender. A die with no partner took no part, so it is null.
 */
export function diceResults(outcome: AttackOutcome): {
  readonly attacker: DieResult[]
  readonly defender: DieResult[]
} {
  const compared = Math.min(outcome.attackerDice.length, outcome.defenderDice.length)
  const attackerWins = (index: number) =>
    (outcome.attackerDice[index] ?? 0) > (outcome.defenderDice[index] ?? 0)

  return {
    attacker: outcome.attackerDice.map((_die, index) =>
      index < compared ? (attackerWins(index) ? 'won' : 'lost') : null,
    ),
    defender: outcome.defenderDice.map((_die, index) =>
      index < compared ? (attackerWins(index) ? 'lost' : 'won') : null,
    ),
  }
}

function wantsLessMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function BoardDice({ outcome, display }: BoardDiceProps) {
  const total = outcome.attackerDice.length + outcome.defenderDice.length
  const [landed, setLanded] = useState(total)
  // Only there to draw the tumbling dice again with new faces.
  const [, setTick] = useState(0)

  useEffect(() => {
    if (wantsLessMotion()) {
      setLanded(total)
      return
    }

    setLanded(0)

    const flicker = setInterval(() => setTick((tick) => tick + 1), FLICKER)
    const timers = Array.from({ length: total }, (_unused, index) =>
      setTimeout(
        () => {
          setLanded(index + 1)

          if (index + 1 === total) {
            clearInterval(flicker)
          }
        },
        ROLL_TIME + (display === 'oneByOne' ? PAUSE * index : 0),
      ),
    )

    // A new attack before this roll lands clears it, so an old roll can
    // never land part way through a new one.
    return () => {
      clearInterval(flicker)
      for (const timer of timers) {
        clearTimeout(timer)
      }
    }
  }, [outcome, display, total])

  const results = diceResults(outcome)
  const allLanded = landed >= total

  const die = (value: number, side: 'attacker' | 'defender', position: number) => {
    const hasLanded = position < landed
    // A tumbling die shows any face. The real one only when it lands.
    const face = hasLanded ? value : 1 + Math.floor(Math.random() * 6)
    const result = allLanded ? results[side][position - (side === 'defender' ? outcome.attackerDice.length : 0)] : null
    const classes = [
      'big-die',
      `big-die-${side}`,
      hasLanded ? '' : 'big-die-rolling',
      result === null || result === undefined ? '' : `big-die-${result}`,
    ]

    return (
      <span
        key={`${side}${position}`}
        className={classes.filter((each) => each !== '').join(' ')}
        role="img"
        aria-label={hasLanded ? `${value}` : 'rolling'}
      >
        {CELLS.map((cell) => (
          <span
            key={cell}
            className={(PIPS[face] ?? []).includes(cell) ? 'pip' : 'pip pip-empty'}
          />
        ))}
      </span>
    )
  }

  return (
    <div className="board-dice" aria-hidden="true">
      <span className="board-dice-side">
        <span className="board-dice-label">Attack</span>
        {outcome.attackerDice.map((value, index) => die(value, 'attacker', index))}
      </span>

      <span className="board-dice-against">against</span>

      <span className="board-dice-side">
        {outcome.defenderDice.map((value, index) =>
          die(value, 'defender', outcome.attackerDice.length + index),
        )}
        <span className="board-dice-label">Defence</span>
      </span>
    </div>
  )
}
