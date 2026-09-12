import {
  MAX_ATTACKER_DICE,
  MAX_DEFENDER_DICE,
  attackerDiceCount,
  defenderDiceCount,
  resolveAttack,
} from './attack'
import { DIE_FACES } from './dice'

/**
 * How a fight comes out on average, with no dice rolled. Plan task 4.49.
 *
 * A player that looks ahead has to imagine a fight before it happens. The
 * obvious way is to roll imaginary dice, and we tried that: the player
 * called Oracle, in plan task 4.46. It lost 13 to 27. The reason is worth
 * remembering. Each imagined game is one sample of very noisy dice, so the
 * gap between two candidate moves is buried under the luck of the playout,
 * and picking the highest score picks the luckiest imagination.
 *
 * This module removes the dice instead. Ask it "if 20 armies attack 15,
 * what happens?" and it answers exactly: taken 82.2% of the time, with
 * 7.83 of mine and 0.72 of theirs left standing on average. Two moves that
 * differ by half an army now score half an army apart, which is the whole
 * point.
 *
 * **The one-exchange odds are worked out by calling `resolveAttack`**, the
 * same function the real game uses, over all 6^5 dice combinations. So this
 * module cannot disagree with the rules about who wins a tie or how many
 * pairs are compared. Only the chaining is ours, and `odds.test.ts` checks
 * that against many thousands of real rolled fights.
 *
 * Fractional armies are fine here. Nothing this module answers ever reaches
 * the real board. It is imagination, and it is thrown away.
 */

/** What one whole fight comes to, on average. */
export interface FightOdds {
  /** The chance the attacker ends up holding the territory, 0 to 1. */
  readonly takes: number
  /** Armies left in the attacking territory on average, capture or not. */
  readonly mineLeft: number
  /** Armies left in the defending territory on average. */
  readonly theirsLeft: number
}

/** The chance of one exchange of dice costing each side this many armies. */
interface Exchange {
  readonly attackerLosses: number
  readonly defenderLosses: number
  readonly chance: number
}

/** Every way `count` dice can land, as a list of rolls. */
function everyRoll(count: number): number[][] {
  let rolls: number[][] = [[]]

  for (let die = 0; die < count; die += 1) {
    const wider: number[][] = []

    for (const roll of rolls) {
      for (let face = 1; face <= DIE_FACES; face += 1) {
        wider.push([...roll, face])
      }
    }
    rolls = wider
  }

  return rolls
}

/**
 * The odds of each result of ONE exchange, for a given number of dice.
 *
 * Every combination is walked and handed to the real `resolveAttack`, so
 * the rules are counted rather than restated.
 */
function exchangesFor(attackerDice: number, defenderDice: number): Exchange[] {
  const counts = new Map<string, number>()
  const attackerRolls = everyRoll(attackerDice)
  const defenderRolls = everyRoll(defenderDice)

  for (const attacker of attackerRolls) {
    for (const defender of defenderRolls) {
      const outcome = resolveAttack(attacker, defender)
      const key = `${outcome.attackerLosses},${outcome.defenderLosses}`

      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const total = attackerRolls.length * defenderRolls.length

  return [...counts].map(([key, count]) => {
    const [attackerLosses, defenderLosses] = key.split(',').map(Number)

    return {
      attackerLosses: attackerLosses as number,
      defenderLosses: defenderLosses as number,
      chance: count / total,
    }
  })
}

/** The exchange odds for every dice pairing, worked out once. */
const EXCHANGES = new Map<string, Exchange[]>()

for (let attacker = 1; attacker <= MAX_ATTACKER_DICE; attacker += 1) {
  for (let defender = 1; defender <= MAX_DEFENDER_DICE; defender += 1) {
    EXCHANGES.set(`${attacker}-${defender}`, exchangesFor(attacker, defender))
  }
}

/**
 * The biggest fight this module will work out exactly.
 *
 * Above it the answer is read off the largest fight of the same shape,
 * because a fight that large is a foregone conclusion and the exact figures
 * stop mattering. It keeps one bad state from building a huge table.
 */
export const BIGGEST_FIGHT = 200

const worked = new Map<string, FightOdds>()

/**
 * How a fight to a finish comes out, on average.
 *
 * The attacker keeps attacking while it can. Both sides roll as many dice
 * as their armies allow, which is what every player in this game does. See
 * spec S9a for the rare case of rolling fewer.
 *
 * @param mine armies in the attacking territory, one of which stays behind
 * @param theirs armies in the defending territory
 */
export function howAFightGoes(mine: number, theirs: number): FightOdds {
  if (!Number.isInteger(mine) || !Number.isInteger(theirs)) {
    throw new Error(`A fight needs whole armies, not ${mine} against ${theirs}.`)
  }

  if (mine < 0 || theirs < 0) {
    throw new Error(`A fight cannot have ${mine} against ${theirs} armies.`)
  }

  if (theirs === 0) {
    return { takes: 1, mineLeft: mine, theirsLeft: 0 }
  }

  // Fewer than 2 armies cannot attack: one must stay behind.
  if (mine < 2) {
    return { takes: 0, mineLeft: mine, theirsLeft: theirs }
  }

  if (mine > BIGGEST_FIGHT || theirs > BIGGEST_FIGHT) {
    const capped = howAFightGoes(
      Math.min(mine, BIGGEST_FIGHT),
      Math.min(theirs, BIGGEST_FIGHT),
    )

    return { ...capped, mineLeft: capped.mineLeft + (mine - Math.min(mine, BIGGEST_FIGHT)) }
  }

  const key = `${mine},${theirs}`
  const already = worked.get(key)

  if (already !== undefined) {
    return already
  }

  const exchanges = EXCHANGES.get(
    `${attackerDiceCount(mine)}-${defenderDiceCount(theirs)}`,
  ) as Exchange[]

  let takes = 0
  let mineLeft = 0
  let theirsLeft = 0

  for (const exchange of exchanges) {
    const after = howAFightGoes(
      mine - exchange.attackerLosses,
      theirs - exchange.defenderLosses,
    )

    takes += exchange.chance * after.takes
    mineLeft += exchange.chance * after.mineLeft
    theirsLeft += exchange.chance * after.theirsLeft
  }

  const answer: FightOdds = { takes, mineLeft, theirsLeft }

  worked.set(key, answer)

  return answer
}
