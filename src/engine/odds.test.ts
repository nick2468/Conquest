import { describe, expect, it } from 'vitest'

import {
  attackerDiceCount,
  defenderDiceCount,
  resolveAttack,
} from './attack'
import { rollDice } from './dice'
import { BIGGEST_FIGHT, howAFightGoes } from './odds'
import { seededRandom } from './random'

/**
 * The guard for the odds table. Plan task 4.49.
 *
 * `howAFightGoes` says what a fight comes to WITHOUT rolling any dice. That
 * is only useful if it agrees with what really happens. A table that
 * quietly disagrees with the rules would teach a player something false and
 * nothing would ever fail, so this test rolls real dice many thousands of
 * times and checks the averages match.
 *
 * This is the second simulator problem, named in plan task 4.46: any model
 * of the rules that sits beside the rules can drift away from them. The
 * one-exchange odds cannot drift, because `odds.ts` counts them by calling
 * `resolveAttack` itself. The chaining can, and that is what this checks.
 */

/** Fight it out for real, rolling every die. Answers what was left. */
function realFight(
  mine: number,
  theirs: number,
  random: ReturnType<typeof seededRandom>,
): { took: boolean; mineLeft: number; theirsLeft: number } {
  let attacker = mine
  let defender = theirs

  while (defender > 0 && attacker >= 2) {
    const outcome = resolveAttack(
      rollDice(random, attackerDiceCount(attacker)),
      rollDice(random, defenderDiceCount(defender)),
    )

    attacker -= outcome.attackerLosses
    defender -= outcome.defenderLosses
  }

  return { took: defender === 0, mineLeft: attacker, theirsLeft: defender }
}

/** Average many real fights of the same size. */
function manyRealFights(mine: number, theirs: number, games: number) {
  const random = seededRandom(mine * 7919 + theirs * 104729 + 11)
  let took = 0
  let mineLeft = 0
  let theirsLeft = 0

  for (let game = 0; game < games; game += 1) {
    const result = realFight(mine, theirs, random)

    if (result.took) took += 1
    mineLeft += result.mineLeft
    theirsLeft += result.theirsLeft
  }

  return {
    takes: took / games,
    mineLeft: mineLeft / games,
    theirsLeft: theirsLeft / games,
  }
}

describe('the odds table matches fights that are really rolled', () => {
  const SIZES: readonly (readonly [number, number])[] = [
    [2, 1],
    [3, 1],
    [3, 2],
    [5, 3],
    [5, 5],
    [8, 5],
    [10, 5],
    [10, 10],
    [20, 10],
    [20, 15],
    [30, 20],
  ]

  const GAMES = 20000

  for (const [mine, theirs] of SIZES) {
    it(`${mine} against ${theirs}`, () => {
      const said = howAFightGoes(mine, theirs)
      const rolled = manyRealFights(mine, theirs, GAMES)

      // Measured gaps over these eleven sizes: at worst 0.007 on the
      // chance and 0.036 on the armies. The bars are set about four times
      // wider than that, which is loose enough never to fail by luck and
      // tight enough to catch a real mistake in the chaining.
      expect(Math.abs(said.takes - rolled.takes)).toBeLessThan(0.015)
      expect(Math.abs(said.mineLeft - rolled.mineLeft)).toBeLessThan(0.1)
      expect(Math.abs(said.theirsLeft - rolled.theirsLeft)).toBeLessThan(0.1)
    })
  }
})

describe('the odds table knows the easy answers', () => {
  it('takes an empty territory without a fight', () => {
    expect(howAFightGoes(5, 0)).toEqual({ takes: 1, mineLeft: 5, theirsLeft: 0 })
  })

  it('cannot attack with one army, because one must stay behind', () => {
    expect(howAFightGoes(1, 3)).toEqual({ takes: 0, mineLeft: 1, theirsLeft: 3 })
  })

  it('works out two against one by hand', () => {
    // One die each. The attacker wins 15 of the 36 rolls, and a tie goes to
    // the defender. Losing leaves the attacker on 1 army, which cannot go on.
    const odds = howAFightGoes(2, 1)

    expect(odds.takes).toBeCloseTo(15 / 36, 10)
    expect(odds.mineLeft).toBeCloseTo(51 / 36, 10)
    expect(odds.theirsLeft).toBeCloseTo(21 / 36, 10)
  })
})

describe('the odds table behaves sensibly', () => {
  it('never gets worse for the attacker with more armies', () => {
    for (let theirs = 1; theirs <= 20; theirs += 1) {
      let before = -1

      for (let mine = 2; mine <= 40; mine += 1) {
        const takes = howAFightGoes(mine, theirs).takes

        expect(takes).toBeGreaterThanOrEqual(before)
        before = takes
      }
    }
  })

  it('never gets better for the attacker with more defenders', () => {
    for (let mine = 2; mine <= 40; mine += 1) {
      let before = 2

      for (let theirs = 1; theirs <= 20; theirs += 1) {
        const takes = howAFightGoes(mine, theirs).takes

        expect(takes).toBeLessThanOrEqual(before)
        before = takes
      }
    }
  })

  it('always answers a chance between none and certain', () => {
    for (let mine = 0; mine <= 50; mine += 1) {
      for (let theirs = 0; theirs <= 50; theirs += 1) {
        const odds = howAFightGoes(mine, theirs)

        expect(odds.takes).toBeGreaterThanOrEqual(0)
        expect(odds.takes).toBeLessThanOrEqual(1)
        expect(odds.mineLeft).toBeGreaterThanOrEqual(0)
        expect(odds.theirsLeft).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('answers a huge fight rather than building a huge table', () => {
    const odds = howAFightGoes(BIGGEST_FIGHT + 500, 3)

    expect(odds.takes).toBeCloseTo(1, 5)
    expect(odds.mineLeft).toBeGreaterThan(BIGGEST_FIGHT)
  })

  it('refuses armies that are not whole', () => {
    expect(() => howAFightGoes(2.5, 3)).toThrow('whole armies')
    expect(() => howAFightGoes(-1, 3)).toThrow('cannot have')
  })
})
