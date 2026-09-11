import { describe, expect, it } from 'vitest'

import { diceResults } from './BoardDice'

describe('which of the big dice won', () => {
  // Plan task 4.27. The big dice ring the winners and fade the losers, so
  // a player can see which die beat which.
  it('compares the highest of each side, then the next highest', () => {
    const results = diceResults({
      attackerDice: [6, 3, 2],
      defenderDice: [5, 4],
      attackerLosses: 1,
      defenderLosses: 1,
    })

    expect(results.attacker).toEqual(['won', 'lost', null])
    expect(results.defender).toEqual(['lost', 'won'])
  })

  it('gives a tie to the defender', () => {
    const results = diceResults({
      attackerDice: [4],
      defenderDice: [4, 1],
      attackerLosses: 1,
      defenderLosses: 0,
    })

    expect(results.attacker).toEqual(['lost'])
    expect(results.defender).toEqual(['won', null])
  })
})
