import { describe, expect, it } from 'vitest'

import { rollDice, scriptedDice } from './dice'
import { fixedRandom, scriptedRandom, seededRandom } from './random'

describe('the seeded source', () => {
  it('gives the same numbers every time for the same seed', () => {
    const first = seededRandom(42)
    const second = seededRandom(42)

    const fromFirst = [0, 1, 2, 3, 4].map(() => first.nextInt(6))
    const fromSecond = [0, 1, 2, 3, 4].map(() => second.nextInt(6))

    expect(fromFirst).toEqual(fromSecond)
  })

  it('gives different numbers for different seeds', () => {
    const first = seededRandom(1)
    const second = seededRandom(2)

    const fromFirst = [0, 1, 2, 3, 4].map(() => first.nextInt(1000))
    const fromSecond = [0, 1, 2, 3, 4].map(() => second.nextInt(1000))

    expect(fromFirst).not.toEqual(fromSecond)
  })

  it('stays inside the range it was asked for', () => {
    const random = seededRandom(7)

    for (let count = 0; count < 500; count += 1) {
      const value = random.nextInt(6)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
    }
  })

  it('reaches every face of a die over many rolls', () => {
    const random = seededRandom(99)
    const seen = new Set<number>()

    for (let count = 0; count < 500; count += 1) {
      seen.add(random.nextInt(6))
    }

    expect(seen.size).toBe(6)
  })
})

describe('the scripted source', () => {
  it('returns the numbers it was given, in order', () => {
    const random = scriptedRandom([3, 0, 5])

    expect(random.nextInt(6)).toBe(3)
    expect(random.nextInt(6)).toBe(0)
    expect(random.nextInt(6)).toBe(5)
  })

  it('complains when a test asks for more numbers than it listed', () => {
    const random = scriptedRandom([1])
    random.nextInt(6)

    expect(() => random.nextInt(6)).toThrow(/ran out/)
  })

  it('complains when a listed number is out of range', () => {
    const random = scriptedRandom([9])

    expect(() => random.nextInt(6)).toThrow(/is not between 0 and 5/)
  })
})

describe('the fixed source', () => {
  it('always answers the same', () => {
    const random = fixedRandom(2)

    expect(random.nextInt(6)).toBe(2)
    expect(random.nextInt(6)).toBe(2)
  })

  it('complains when it cannot answer inside the range', () => {
    expect(() => fixedRandom(5).nextInt(3)).toThrow()
  })
})

describe('rolling dice', () => {
  it('rolls the number of dice asked for', () => {
    expect(rollDice(seededRandom(1), 3)).toHaveLength(3)
    expect(rollDice(seededRandom(1), 0)).toHaveLength(0)
  })

  it('only ever rolls faces from 1 to 6', () => {
    const random = seededRandom(5)

    for (const die of rollDice(random, 200)) {
      expect(die).toBeGreaterThanOrEqual(1)
      expect(die).toBeLessThanOrEqual(6)
    }
  })

  it('rolls the faces a test asked for', () => {
    expect(rollDice(scriptedDice([6, 1, 4]), 3)).toEqual([6, 1, 4])
  })

  it('refuses a face that is not on a die', () => {
    expect(() => scriptedDice([7])).toThrow(/7 is not a face/)
  })
})
