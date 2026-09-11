/**
 * Every number that changes how the game plays. See spec S15.
 *
 * These are settings, not facts. We took them from the board game Risk and
 * from guesswork, and we have not played a full game yet. They will be wrong.
 *
 * They live together so that changing one is a one-line edit with no hunting.
 * This is also the file James can change on his own, with no programming.
 * Change a number, play a game, change it again.
 *
 * The one balance number NOT here is a region's bonus, which lives with the
 * region in the map file. A bonus belongs to a map, not to the game.
 */

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/**
 * Armies each player starts with, by how many players are in the game.
 *
 * Fewer players means a bigger army each, so the board fills up either way.
 */
export const STARTING_ARMIES: Readonly<Record<number, number>> = {
  2: 40,
  3: 35,
  4: 30,
  5: 25,
  6: 20,
}

/** Territories a player needs to earn one army at the start of a turn. */
export const TERRITORIES_PER_ARMY = 3

/**
 * The fewest armies a turn can ever give.
 *
 * This one matters more than it looks. Without it a player down to two
 * territories gets nothing and can never come back.
 */
export const MINIMUM_REINFORCEMENTS = 3

/** What a set of three cards is worth when the value is fixed. See spec 6.6. */
export const FIXED_SET_VALUE = {
  infantry: 4,
  cavalry: 6,
  artillery: 8,
  /** Three different symbols. */
  mixed: 10,
} as const

/**
 * What a set is worth when the value rises. The first set traded in the whole
 * game is worth 4, the second 6, and so on down the list.
 */
export const RISING_SET_VALUES: readonly number[] = [4, 6, 8, 10, 12, 15]

/** Every set after the list above is worth this much more than the last. */
export const RISING_SET_INCREMENT = 5

/**
 * The most a rising set can ever be worth.
 *
 * Nick, in a one-on-one game where both sides were getting hundreds of
 * armies a turn: "The armies from redeeming each set shouldn't increase
 * per redemption without a limit in place." With no ceiling the value
 * grows forever: a computer-versus-computer game once reached round 1796
 * with a single territory holding 1,337,626 armies. See plan tasks 4.8,
 * 4.10 and 4.16. Number.POSITIVE_INFINITY means no ceiling at all.
 */
export const RISING_SET_CAP = 20

/** Holding this many cards forces a player to trade a set. */
export const CARDS_FORCING_A_TRADE = 5

/**
 * Holding this many cards straight after knocking a player out forces
 * trades at once, before attacking again, down to one fewer than
 * CARDS_FORCING_A_TRADE. The printed rules say six. Plan task 4.21.
 */
export const CARDS_AFTER_A_KNOCKOUT = 6

/** Wild cards in the deck. A wild card counts as any symbol. */
export const WILD_CARDS = 2

/**
 * The colour for each player, in the order players join.
 *
 * Picked to stay apart from each other for someone who cannot tell red from
 * green. They differ in lightness as well as in hue, so they are still
 * distinct if the colour goes altogether.
 */
export const PLAYER_COLOURS: readonly string[] = [
  '#c8453b', // red
  '#2f6fb0', // blue
  '#e3b62c', // yellow
  '#3f8f5e', // green
  '#8557a8', // purple
  '#4a4a52', // charcoal
]
