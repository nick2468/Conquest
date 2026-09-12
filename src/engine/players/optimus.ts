import { GENERAL_SETTINGS, generalPlaying } from './general'
import type { ComputerPlayer } from './types'

/**
 * The General, playing by numbers a machine chose. Plan task 4.42.
 *
 * Nick: "is there a way that we could use machine learning techniques to
 * work out the strongest strategy and tactics?" `tools/tune.mjs` played
 * about 30,000 games, keeping the settings that won most and narrowing in
 * on them, which is the cross-entropy method.
 *
 * Optimus thinks exactly as the General does. Every line of `general.ts`
 * serves both. Only these numbers differ, so the pair says what the tuning
 * is worth, in games, and nothing else has changed to muddy it.
 *
 * The tuner disagreed with us about four things, and won:
 *
 * - the line behind the front holds ONE army, not two,
 * - a front territory holds HALF the biggest enemy beside it, not all,
 * - breaking somebody's continent is worth 2 an army of bonus, not 6,
 * - and attacks want a margin of 3 over the defender, not 1, with twice as
 *   many armies kept on the stack to keep going.
 *
 * Read together: it holds a thinner line in fewer places, and hits harder
 * where it does hit.
 */
export const OPTIMUS_SETTINGS: typeof GENERAL_SETTINGS = {
  ...GENERAL_SETTINGS,
  secondLine: 1,
  frontShare: 0.5,
  breakIsWorth: 2,
  onPlan: 9,
  toKeepGoing: 4,
  safeMargin: 3,
  cardOdds: 7.5,
  cardWorthShare: 0.5,
  leaveItToOthers: 0.25,
  cardsMatter: 3.5,
  taxIsWorth: 4.5,
  hitBackIsWorth: 7,
  retakeIsWorth: 4,
  cheapLean: 2.5,
  leaderIsWorth: 7,
  leaderLead: 1.6,
  raceIsWorth: 3.5,
}

/**
 * What changes again when only one opponent is left.
 *
 * The General's duel settings thin its line; Optimus plays a thin line
 * always, so only these are left. Guarding what it denies measured 9 - 11
 * head to head with it and 11 - 9 without: with one enemy there is no
 * third player to take the continent while we hold the door.
 */
export const OPTIMUS_DUEL: Partial<typeof GENERAL_SETTINGS> = {
  occupyKeepsSecondLine: false,
  counterChance: 0,
  denialGuard: 0,
}

/**
 * What changes once the board has coalesced. Plan task 4.43.
 *
 * Nick: "the game starts with a random distribution but starts to coalesce
 * into clusters... Is there merit in having Optimus being able switch to a
 * different tuning either by number of players being faced or the board
 * maturity state?" A scattered board and a board of solid blocks are
 * different games: at the start nobody has a front line and every
 * territory touches an enemy.
 *
 * Empty means Optimus plays one way throughout. The tuner fills this in,
 * measuring the second stage on its own. See `boardMaturity`.
 */
export const OPTIMUS_LATE: Partial<typeof GENERAL_SETTINGS> = {
  // Thinner still on the front, and deeper stacks to push with.
  frontShare: 0.3,
  doorGuard: 3,
  toKeepGoing: 6,
  // Once the board is blocks, finishing your own continent IS the game.
  onPlan: 15,
  breakIsWorth: 4,
  finishIsWorth: 2,
  // And a card is worth chasing much harder: sets are large by now.
  cardOdds: 16,
  cardWorthShare: 0.3,
  knockoutIsWorth: 9,
  cardsMatter: 2.5,
  // Less interest in small change: taxing the next player and chasing a
  // dying player's cards both fall away.
  taxIsWorth: 2,
  raceLand: 4,
  raceIsWorth: 1.25,
  // More leaning on a leader, and a little more hitting back.
  leaderIsWorth: 11,
  leaderLead: 1.7,
  leaveItToOthers: 0.3,
  counterChance: 0.3,
  hitBackIsWorth: 8,
  retakeIsWorth: 2.5,
}

/** How coalesced the board must be for the late numbers to take over. */
export const OPTIMUS_LATE_FROM = 0.4

export const OPTIMUS: ComputerPlayer = generalPlaying(
  'optimus',
  'Optimus',
  'The General, playing by numbers a machine tuned over thirty thousand games.',
  OPTIMUS_SETTINGS,
  OPTIMUS_DUEL,
  OPTIMUS_LATE,
  OPTIMUS_LATE_FROM,
)
