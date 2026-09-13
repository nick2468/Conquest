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
 * **These numbers are the second tuning, and the first honest one.** Plan
 * task 4.54. Until 2026-09-13 the tuner judged each candidate on 48 games,
 * where the error is about seven percentage points, so it could not see a
 * difference smaller than roughly twenty. It was choosing at random among
 * everything reasonable. Raised to 480 games a candidate, the same search
 * moved 28 numbers together and found a real gain, confirmed on seed
 * families it never saw:
 *
 * | Against | Before | After |
 * |---|---|---|
 * | Planner, Greedy and the Turtle | 49.7% | 56.6% |
 * | Turtle, General and Planner | 45.2% | 48.9% |
 * | the General, head to head | 47.0% | 53.0% |
 * | the Turtle, head to head | 85.1% | 88.3% |
 *
 * **The gain was in the interactions.** A sweep of every dial ONE AT A TIME
 * at 1200 games, in plan task 4.53, found nothing worth more than a
 * standard error. Moving them together found seven points. One-at-a-time
 * testing cannot see this by construction, which is worth remembering
 * before the next such sweep.
 *
 * Two things it found on its own that we had found by hand that morning,
 * from different measurements: `onPlan` near 16, and holding a fourth card
 * before trading. Agreement from two methods is worth more than either.
 *
 * `secondLine` stays at the General's 2. The tuner wanted 1, and measured
 * over 17640 games the two are level, so Nick's rule stands: the line
 * behind the front holds "at least more than one".
 *
 * One dial moved for the first time ever. `leaveItToOthers` had been read
 * off the General's own numbers by mistake, so Optimus's value was thrown
 * away and every past tuning of it was wasted. Plan task 4.53 fixed that,
 * and this is the first run where the tuner could actually move it.
 */
export const OPTIMUS_SETTINGS: typeof GENERAL_SETTINGS = {
  ...GENERAL_SETTINGS,
  // Fewer, thicker places. Half the front line the General wants, but a
  // deeper guard on the doors of a region we hold.
  doorGuard: 3,
  denialGuard: 1,
  frontShare: 0.4,
  // The map is a means, not the point. Breaking somebody's continent is
  // worth a third of what the General thinks, and finishing our own a
  // little less. But WORKING towards one is worth twice as much: a
  // scattered board should chase a continent about as hard as a coalesced
  // one already does.
  breakIsWorth: 1.74,
  onPlan: 15.47,
  finishIsWorth: 3.38,
  // Hit harder and keep going. Three armies of margin, not one.
  toKeepGoing: 4,
  safeMargin: 3,
  // Cards are the game. Chase the likeliest capture nearly twice as hard as
  // the General, hold a fourth card before trading, and let a region that
  // somebody else could break be somebody else's problem.
  cardOdds: 16.94,
  cardWorthShare: 0.63,
  tradeAt: 4,
  leaveItToOthers: 0.41,
  knockoutIsWorth: 6.69,
  cardsMatter: 3.3,
  // Costing the next player an army is worth twice what the General
  // thought, and racing a dying player for their cards nearly twice.
  taxIsWorth: 8.31,
  raceIsWorth: 5.81,
  // Hitting back is much as before. Retaking what was taken matters less.
  counterChance: 0.21,
  hitBackIsWorth: 7.62,
  retakeIsWorth: 3.17,
  // The leader gets chopped only where it is CHEAP. Optimus leans harder on
  // the odds before it goes and cares far less about the prize, which is
  // the opposite of what we wrote by hand.
  cheapLean: 3.72,
  leaderIsWorth: 2.21,
  leaderLead: 1.71,
  // Nearly no ties, so it takes the best move it can see and stays
  // predictable. And it pushes on after a capture rather than leaving the
  // garrison the front line asked for.
  nearlyAsGood: 0.05,
  keepAfterCapture: 0.44,
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
  // Attack far more freely: with one opponent, ground taken is ground they
  // have lost, and there is nobody else to punish a thin line.
  safeMargin: 1,
  frontShare: 0.4,
  denialGuard: 1,
  // The card matters more, and so does costing the only opponent an army a
  // turn: taxing them is taxing the whole field.
  cardOdds: 11,
  cardWorthShare: 0.6,
  taxIsWorth: 7,
  // The map matters less. Finishing our own continent is worth nothing
  // head to head, and their continents only a little more.
  onPlan: 5.5,
  finishIsWorth: 0,
  breakIsWorth: 3.5,
  leaveItToOthers: 0.3,
  // Their cards are still a prize, and a player on their last territory is
  // the whole game, so the race starts only there.
  knockoutIsWorth: 5,
  cardsMatter: 3,
  raceLand: 1,
  raceIsWorth: 5,
  leaderIsWorth: 6.5,
  leaderLead: 1.5,
  counterChance: 0.1,
  hitBackIsWorth: 5.5,
  retakeIsWorth: 1.25,
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
