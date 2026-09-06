import { DIE_FACES } from './dice'

/** The most dice each side may roll. See spec 6.2. */
export const MAX_ATTACKER_DICE = 3
export const MAX_DEFENDER_DICE = 2

/** One army must always stay behind in the attacking territory. */
export const ARMIES_LEFT_BEHIND = 1

/** What one exchange of dice did to each side. */
export interface AttackOutcome {
  /** The attacker's dice, sorted high to low. */
  readonly attackerDice: readonly number[]
  /** The defender's dice, sorted high to low. */
  readonly defenderDice: readonly number[]
  /** Armies the attacker loses. 0, 1 or 2. */
  readonly attackerLosses: number
  /** Armies the defender loses. 0, 1 or 2. */
  readonly defenderLosses: number
}

/**
 * How many dice the attacker rolls, given the armies in the attacking
 * territory. One army must stay behind, so 4 armies rolls 3 dice.
 */
export function attackerDiceCount(armies: number): number {
  return Math.min(MAX_ATTACKER_DICE, armies - ARMIES_LEFT_BEHIND)
}

/**
 * How many dice the defender rolls, given the armies in the defending
 * territory. The defender risks every army, so 1 army rolls 1 die.
 */
export function defenderDiceCount(armies: number): number {
  return Math.min(MAX_DEFENDER_DICE, armies)
}

function checkDice(dice: readonly number[], side: string, most: number): void {
  if (dice.length < 1 || dice.length > most) {
    throw new Error(
      `The ${side} rolled ${dice.length} dice. It must be 1 to ${most}.`,
    )
  }

  for (const die of dice) {
    if (!Number.isInteger(die) || die < 1 || die > DIE_FACES) {
      throw new Error(`${die} is not a face on a die. Use 1 to ${DIE_FACES}.`)
    }
  }
}

function highestFirst(dice: readonly number[]): number[] {
  return [...dice].sort((left, right) => right - left)
}

/**
 * Work out one exchange of dice. See spec 6.3.
 *
 * This function does not roll the dice. They are handed to it already rolled,
 * so a test can name the exact dice and the exact answer. See spec S9.
 *
 * The rule people misremember: when two dice are equal, the ATTACKER loses
 * the army. The defender wins a tie.
 */
export function resolveAttack(
  attackerDice: readonly number[],
  defenderDice: readonly number[],
): AttackOutcome {
  checkDice(attackerDice, 'attacker', MAX_ATTACKER_DICE)
  checkDice(defenderDice, 'defender', MAX_DEFENDER_DICE)

  const attacker = highestFirst(attackerDice)
  const defender = highestFirst(defenderDice)

  // Only as many pairs as the smaller side has dice.
  const pairs = Math.min(attacker.length, defender.length)

  let attackerLosses = 0
  let defenderLosses = 0

  for (let pair = 0; pair < pairs; pair += 1) {
    const attackerDie = attacker[pair] as number
    const defenderDie = defender[pair] as number

    if (attackerDie > defenderDie) {
      defenderLosses += 1
    } else {
      attackerLosses += 1
    }
  }

  return {
    attackerDice: attacker,
    defenderDice: defender,
    attackerLosses,
    defenderLosses,
  }
}
