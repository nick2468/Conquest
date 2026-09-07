/**
 * Where every random number in the game comes from.
 *
 * The engine never calls Math.random. A random source is handed in instead.
 * See spec S10. That one rule is what makes every rule in the game testable
 * with an exact answer.
 */
export interface RandomSource {
  /** A whole number from 0 up to, but not including, maxExclusive. */
  nextInt(maxExclusive: number): number
}

function checkRange(maxExclusive: number): void {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new Error(
      `nextInt needs a whole number of 1 or more, but got ${maxExclusive}.`,
    )
  }
}

/**
 * A source that can say how far through it is.
 *
 * A game played across several iPads is held by a server, and a server can
 * be shut down and started again between one move and the next. The dice
 * have to carry on from where they were, or the same seed would stop
 * meaning the same game. So the seed and the count are saved, and the
 * source is built again from both. See plan task 6.1.
 */
export interface SavedRandom extends RandomSource {
  /** How many numbers this source has given out so far. */
  readonly drawn: number
}

/**
 * The source a real game uses.
 *
 * The same seed always produces the same game. So a game can be replayed
 * exactly, and a bug found while playing can be turned into a test.
 *
 * Pass `alreadyDrawn` to carry on from where a saved game left off. The
 * numbers that follow are exactly the ones that would have followed.
 *
 * The arithmetic below is a small, well known generator called mulberry32.
 * It is not fit for anything to do with security. It is fit for dice.
 */
export function seededRandom(seed: number, alreadyDrawn = 0): SavedRandom {
  let state = seed >>> 0
  let count = 0

  const step = (): void => {
    state = (state + 0x6d2b79f5) | 0
    count += 1
  }

  // Wind it forward to where it was, one step at a time. A game of a
  // thousand moves draws a few thousand numbers, so this costs nothing.
  for (let done = 0; done < alreadyDrawn; done += 1) {
    step()
  }

  return {
    get drawn(): number {
      return count
    },

    nextInt(maxExclusive: number): number {
      checkRange(maxExclusive)
      step()

      let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
      const fraction = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296

      return Math.floor(fraction * maxExclusive)
    },
  }
}

/**
 * A source for tests. It returns the numbers you listed, in order.
 *
 * It throws if a test asks for more numbers than it listed, or if a listed
 * number is out of range. Both mean the test is wrong, and a test that is
 * wrong should say so loudly rather than quietly pass.
 */
export function scriptedRandom(values: readonly number[]): RandomSource {
  let position = 0

  return {
    nextInt(maxExclusive: number): number {
      checkRange(maxExclusive)

      if (position >= values.length) {
        throw new Error(
          `scriptedRandom ran out. It was given ${values.length} numbers ` +
            `and asked for ${position + 1}.`,
        )
      }

      const value = values[position] as number
      position += 1

      if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
        throw new Error(
          `scriptedRandom value ${value} at position ${position - 1} is not ` +
            `between 0 and ${maxExclusive - 1}.`,
        )
      }

      return value
    },
  }
}

/**
 * Put a list in a random order, without changing the list you were given.
 *
 * It walks the list backwards, swapping each item with one picked from the
 * part not yet walked. That gives every order an equal chance, which a
 * simpler-looking shuffle does not.
 */
export function shuffle<Item>(
  random: RandomSource,
  items: readonly Item[],
): Item[] {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = random.nextInt(index + 1)
    const held = shuffled[index] as Item

    shuffled[index] = shuffled[swapWith] as Item
    shuffled[swapWith] = held
  }

  return shuffled
}

/** A source for tests that always answers the same. */
export function fixedRandom(value: number): RandomSource {
  return {
    nextInt(maxExclusive: number): number {
      checkRange(maxExclusive)

      if (value < 0 || value >= maxExclusive) {
        throw new Error(
          `fixedRandom(${value}) cannot answer a request for a number ` +
            `below ${maxExclusive}.`,
        )
      }

      return value
    },
  }
}
