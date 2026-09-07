import { describe, expect, it } from 'vitest'

import { rollDice, scriptedDice } from './dice'
import { fixedRandom, scriptedRandom, seededRandom } from './random'

describe('a source that can be saved and taken up again', () => {
  it('gives the same numbers as one that never stopped', () => {
    // A game held by a server is played across restarts. If the dice did
    // not carry on from where they were, the same seed would stop meaning
    // the same game. See plan task 6.1.
    const straightThrough = seededRandom(1234)
    const first: number[] = []

    for (let step = 0; step < 30; step += 1) {
      first.push(straightThrough.nextInt(6))
    }

    const stopped = seededRandom(1234)
    const before: number[] = []

    for (let step = 0; step < 12; step += 1) {
      before.push(stopped.nextInt(6))
    }

    const takenUp = seededRandom(1234, stopped.drawn)
    const after: number[] = []

    for (let step = 0; step < 18; step += 1) {
      after.push(takenUp.nextInt(6))
    }

    expect([...before, ...after]).toEqual(first)
  })

  it('counts every number it gives out', () => {
    const random = seededRandom(7)

    expect(random.drawn).toBe(0)
    random.nextInt(6)
    random.nextInt(6)
    expect(random.drawn).toBe(2)
  })

  it('counts from where it was taken up', () => {
    const random = seededRandom(7, 40)

    expect(random.drawn).toBe(40)
    random.nextInt(6)
    expect(random.drawn).toBe(41)
  })
})

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
