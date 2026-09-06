import { describe, expect, it } from 'vitest'

import {
  attackerDiceCount,
  defenderDiceCount,
  resolveAttack,
} from './attack'

describe('how many dice each side rolls', () => {
  it('gives the attacker one die less than their armies, up to three', () => {
    expect(attackerDiceCount(2)).toBe(1)
    expect(attackerDiceCount(3)).toBe(2)
    expect(attackerDiceCount(4)).toBe(3)
    expect(attackerDiceCount(20)).toBe(3)
  })

  it('gives the defender one die for each army, up to two', () => {
    expect(defenderDiceCount(1)).toBe(1)
    expect(defenderDiceCount(2)).toBe(2)
    expect(defenderDiceCount(20)).toBe(2)
  })
})

describe('resolving an attack', () => {
  it('makes the defender lose when the attacker rolls higher', () => {
    const outcome = resolveAttack([6], [2])

    expect(outcome.defenderLosses).toBe(1)
    expect(outcome.attackerLosses).toBe(0)
  })

  it('makes the attacker lose when the defender rolls higher', () => {
    const outcome = resolveAttack([2], [6])

    expect(outcome.attackerLosses).toBe(1)
    expect(outcome.defenderLosses).toBe(0)
  })

  // The rule people misremember. It is why attacking is expensive.
  it('makes the ATTACKER lose a tie', () => {
    const outcome = resolveAttack([4], [4])

    expect(outcome.attackerLosses).toBe(1)
    expect(outcome.defenderLosses).toBe(0)
  })

  it('compares two pairs when both sides rolled two or more dice', () => {
    // Attacker 6 and 3, defender 5 and 4.
    // Highest pair: 6 beats 5, so the defender loses one.
    // Second pair: 3 loses to 4, so the attacker loses one.
    const outcome = resolveAttack([3, 6, 2], [4, 5])

    expect(outcome.attackerLosses).toBe(1)
    expect(outcome.defenderLosses).toBe(1)
  })

  it('compares only one pair when the defender rolled one die', () => {
    const outcome = resolveAttack([6, 5, 4], [3])

    expect(outcome.defenderLosses).toBe(1)
    expect(outcome.attackerLosses).toBe(0)
  })

  it('can cost the attacker two armies in one roll', () => {
    const outcome = resolveAttack([2, 1, 1], [6, 6])

    expect(outcome.attackerLosses).toBe(2)
    expect(outcome.defenderLosses).toBe(0)
  })

  it('can cost the defender two armies in one roll', () => {
    const outcome = resolveAttack([6, 6, 1], [2, 2])

    expect(outcome.defenderLosses).toBe(2)
    expect(outcome.attackerLosses).toBe(0)
  })

  it('always costs exactly one army for each pair compared', () => {
    const outcome = resolveAttack([5, 3, 1], [5, 3])

    expect(outcome.attackerLosses + outcome.defenderLosses).toBe(2)
  })

  it('sorts the dice high to low in the result', () => {
    const outcome = resolveAttack([1, 6, 3], [2, 5])

    expect(outcome.attackerDice).toEqual([6, 3, 1])
    expect(outcome.defenderDice).toEqual([5, 2])
  })

  it('does not change the arrays it was given', () => {
    const attackerDice = [1, 6, 3]
    resolveAttack(attackerDice, [4])

    expect(attackerDice).toEqual([1, 6, 3])
  })
})

describe('resolving an attack refuses nonsense', () => {
  it('refuses more than three attacker dice', () => {
    expect(() => resolveAttack([1, 2, 3, 4], [5])).toThrow(/attacker rolled 4/)
  })

  it('refuses more than two defender dice', () => {
    expect(() => resolveAttack([1], [1, 2, 3])).toThrow(/defender rolled 3/)
  })

  it('refuses no dice at all', () => {
    expect(() => resolveAttack([], [1])).toThrow()
  })

  it('refuses a die that is not a face on a die', () => {
    expect(() => resolveAttack([7], [1])).toThrow(/7 is not a face/)
    expect(() => resolveAttack([0], [1])).toThrow(/0 is not a face/)
  })
})
