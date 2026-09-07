import { useEffect, useState } from 'react'

import type { AttackOutcome, GameOptions } from '../engine'

interface DiceProps {
  readonly outcome: AttackOutcome
  readonly display: GameOptions['diceDisplay']
}

/** How long between dice when they come one at a time. */
const PAUSE = 260

/**
 * The dice from the last attack.
 *
 * This changes nothing about the result. It only changes how the result
 * arrives. See spec section 7: the engine ignores this setting entirely.
 */
export function Dice({ outcome, display }: DiceProps) {
  const total = outcome.attackerDice.length + outcome.defenderDice.length
  const [shown, setShown] = useState(total)

  useEffect(() => {
    if (display === 'allAtOnce') {
      setShown(total)
      return
    }

    setShown(0)

    const timers = Array.from({ length: total }, (_unused, index) =>
      setTimeout(() => setShown(index + 1), PAUSE * (index + 1)),
    )

    // Every timer is cleared if a new attack lands before this one finishes,
    // so dice from an old roll can never appear part way through a new one.
    return () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
    }
  }, [outcome, display, total])

  const attackerShown = outcome.attackerDice.slice(0, shown)
  const defenderShown = outcome.defenderDice.slice(
    0,
    Math.max(0, shown - outcome.attackerDice.length),
  )

  return (
    <div className="dice-row" aria-label="The last dice" aria-live="polite">
      <span className="dice-side">
        {attackerShown.map((die, index) => (
          <span className="die die-attacker" key={`a${index}`}>
            {die}
          </span>
        ))}
      </span>

      {defenderShown.length === 0 ? null : (
        <span className="dice-against">against</span>
      )}

      <span className="dice-side">
        {defenderShown.map((die, index) => (
          <span className="die die-defender" key={`d${index}`}>
            {die}
          </span>
        ))}
      </span>

      {shown < total ? null : (
        <span className="dice-result">
          {outcome.attackerLosses === 0
            ? null
            : `Attacker loses ${outcome.attackerLosses}. `}
          {outcome.defenderLosses === 0
            ? null
            : `Defender loses ${outcome.defenderLosses}.`}
        </span>
      )}
    </div>
  )
}
