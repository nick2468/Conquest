import type { RandomSource } from './random'
import { scriptedRandom } from './random'

/** The faces on one die. */
export const DIE_FACES = 6

/**
 * Roll some dice. Each result is a whole number from 1 to 6.
 */
export function rollDice(random: RandomSource, count: number): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Cannot roll ${count} dice. The count must be 0 or more.`)
  }

  const dice: number[] = []

  for (let rolled = 0; rolled < count; rolled += 1) {
    dice.push(random.nextInt(DIE_FACES) + 1)
  }

  return dice
}

/**
 * A random source for tests, written as the dice faces you want.
 *
 * `scriptedDice([6, 1])` makes the next two rolls come up 6 then 1. Without
 * this a test has to write [5, 0], because a source counts from zero. The
 * dice faces are what the reader cares about, so the test says those.
 */
export function scriptedDice(faces: readonly number[]): RandomSource {
  for (const face of faces) {
    if (!Number.isInteger(face) || face < 1 || face > DIE_FACES) {
      throw new Error(`${face} is not a face on a die. Use 1 to ${DIE_FACES}.`)
    }
  }

  return scriptedRandom(faces.map((face) => face - 1))
}
