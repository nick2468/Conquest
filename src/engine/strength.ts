import { regionBonusFor } from './reinforce'
import type { GameState, PlayerId } from './types'

/**
 * How strong each player's position is. Plan task 4.51.
 *
 * These numbers are MEASURED, not chosen. 240 four-player games were
 * played and every live player's position was recorded at every turn,
 * 82846 positions in all, each labelled with whether that player went on to
 * win. A logistic fit then asked which parts of a position predicted the
 * winner. The weights below are the answer, and they name the winner 78.4%
 * of the time on 240 further games the fit never saw, against 70.7% for
 * guessing that nobody wins. Plan task 4.50 has the full workings.
 *
 * Three things the measurement said that guessing had got wrong:
 *
 * 1. **Shares beat counts.** How many armies you hold hardly matters. What
 *    matters is what SHARE of every army on the board is yours.
 * 2. **Land and income are nearly the same thing**, because income is
 *    mostly land divided by three. Counting both is counting once.
 * 3. **A long front line is a weakness.** Every territory of yours that
 *    faces an enemy costs a little, which is why a corner region is worth
 *    more than its bonus alone says.
 *
 * This is for SHOWING a player where they stand. It is deliberately not
 * used to choose moves: plan task 4.50 measured that and it played badly,
 * because a rule that keeps army share high says never attack.
 */

/** What each part of a position is worth, as a log-odds. */
export const STRENGTH = {
  /** Your share of all the land on the board. */
  landShare: 2.9763,
  /** Your share of all the armies on the board. */
  armiesShare: 5.89782,
  /** Each card in hand, because a card becomes armies. */
  cards: 0.1012,
  /** Each of your territories that faces an enemy. */
  frontier: -0.03884,
  /** Each army of region bonus, over and above the land that earns it. */
  bonus: 0.0791,
  /** Where the count starts. */
  start: -3.72218,
}

/**
 * The raw reading for one player, as a log-odds: zero is an even chance,
 * above zero is winning.
 */
export function strengthOf(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((each) => each.id === playerId)

  if (player === undefined || player.isEliminated) {
    return -Infinity
  }

  let land = 0
  let armies = 0
  let frontier = 0
  let allLand = 0
  let allArmies = 0

  for (const territory of state.map.territories) {
    const here = state.territories[territory.id]

    if (here === undefined || here.ownerId === null) continue

    allLand += 1
    allArmies += here.armies

    if (here.ownerId !== playerId) continue

    land += 1
    armies += here.armies

    if (
      territory.borders.some(
        (id) => state.territories[id]?.ownerId !== playerId,
      )
    ) {
      frontier += 1
    }
  }

  // Armies still waiting to go on the board count too. During setup they
  // are most of what a player has.
  const held = armies + player.reserve
  const total = allArmies + state.players.reduce((sum, each) => sum + each.reserve, 0)

  return (
    STRENGTH.start +
    (land / Math.max(1, allLand)) * STRENGTH.landShare +
    (held / Math.max(1, total)) * STRENGTH.armiesShare +
    player.cards.length * STRENGTH.cards +
    frontier * STRENGTH.frontier +
    regionBonusFor(state.map, state.territories, playerId) * STRENGTH.bonus
  )
}

/** One player's place in the game, ready to show. */
export interface Standing {
  readonly playerId: PlayerId
  /** The chance of winning, 0 to 1. The live players' chances add to 1. */
  readonly chance: number
  /** 1 for the strongest. Every player who is out shares the last place. */
  readonly place: number
}

/**
 * Where every player stands, strongest first.
 *
 * The chances are scaled so that they add up to one. The fit answers each
 * player on their own, so four players can each read "40%", which is true
 * of each of them and useless as a table. Sharing out the whole is what a
 * reader means by "who is winning".
 */
export function standings(state: GameState): readonly Standing[] {
  const live = state.players.filter((each) => !each.isEliminated)
  const raw = live.map((player) => ({
    playerId: player.id,
    weight: 1 / (1 + Math.exp(-strengthOf(state, player.id))),
  }))

  const total = raw.reduce((sum, each) => sum + each.weight, 0)

  const ranked = [...raw]
    .sort((one, two) => two.weight - one.weight)
    .map((each, index) => ({
      playerId: each.playerId,
      chance: total > 0 ? each.weight / total : 1 / Math.max(1, raw.length),
      place: index + 1,
    }))

  const out = state.players
    .filter((each) => each.isEliminated)
    .map((each) => ({ playerId: each.id, chance: 0, place: ranked.length + 1 }))

  return [...ranked, ...out]
}
