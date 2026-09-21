import type { GameAction } from './game'
import type { Recording } from './replay'
import type { GameState, PlayerId, TerritoryId } from './types'

/**
 * A finished (or unfinished) game, written to a file so it can be looked at
 * later. Plan task 4.58.
 *
 * Nick: "Are games logged so that I can refer you to a logfile of a match I
 * think you should look at for balance issues?" They were not. The history
 * panel lived only as long as the game did. This is the log.
 *
 * It is small because of how the engine works (spec S2, S3): a game is the
 * board it began on, the dice seed, and the list of actions. Replaying the
 * actions gives back every board of the game exactly, which is what
 * `tools/read-game.mjs` does. Nothing is asked of the computer players
 * again: the file records what they DID, so a later change to how they
 * think cannot change the game on replay.
 *
 * A later change to the RULES could, so the file also records how the game
 * ended. A replay that ends differently says so rather than quietly showing
 * a different game.
 */

/** Written into every file, so a file can be recognised and its shape known. */
export const SAVED_GAME_FORMAT = 'conquest-game'
export const SAVED_GAME_VERSION = 1

/** Which build of the game wrote the file, as shown on the new game screen. */
export interface BuildStamp {
  readonly commit: string
  readonly time: string
}

/** How the game stood when it was saved, to check a replay against. */
export interface Ending {
  readonly round: number
  readonly winnerId: PlayerId | null
  readonly owners: Readonly<Record<TerritoryId, PlayerId | null>>
}

export interface SavedGame {
  readonly format: typeof SAVED_GAME_FORMAT
  readonly version: typeof SAVED_GAME_VERSION
  /** Which build wrote it. Missing when the build did not say. */
  readonly build: BuildStamp | null
  /** When it was saved, as the device's clock said. Passed in: see spec S2. */
  readonly savedAt: string
  /** The seed the dice started from. With `first`, it replays the game. */
  readonly diceSeed: number
  readonly first: GameState
  readonly actions: readonly GameAction[]
  readonly ending: Ending
}

/** How the board stands right now, in the form a saved game keeps. */
export function endingOf(state: GameState): Ending {
  return {
    round: state.round,
    winnerId: state.winnerId,
    owners: Object.fromEntries(
      Object.entries(state.territories).map(([id, each]) => [id, each.ownerId]),
    ),
  }
}

/** Put a game into the form written to a file. */
export function toSavedGame(
  recording: Recording,
  diceSeed: number,
  now: GameState,
  savedAt: string,
  build: BuildStamp | null,
): SavedGame {
  return {
    format: SAVED_GAME_FORMAT,
    version: SAVED_GAME_VERSION,
    build,
    savedAt,
    diceSeed,
    first: recording.first,
    actions: recording.actions,
    ending: endingOf(now),
  }
}

/** Something wrong with a file handed in to be read. */
export class SavedGameError extends Error {
  override readonly name = 'SavedGameError'
}

/**
 * Read a saved game back from the text of its file.
 *
 * Checks the shape enough to fail with a plain message rather than halfway
 * through a replay. It does not check every field of every board: the
 * replay does that far more thoroughly, by playing the game.
 */
export function readSavedGame(text: string): SavedGame {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SavedGameError('This is not a saved game: it is not readable as a game file.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new SavedGameError('This is not a saved game.')
  }

  const game = parsed as Record<string, unknown>

  if (game.format !== SAVED_GAME_FORMAT) {
    throw new SavedGameError('This is not a saved Conquest game.')
  }

  if (game.version !== SAVED_GAME_VERSION) {
    throw new SavedGameError(
      `This game was saved in format ${String(game.version)}, and this reads format ${SAVED_GAME_VERSION}.`,
    )
  }

  if (
    typeof game.diceSeed !== 'number' ||
    typeof game.first !== 'object' ||
    game.first === null ||
    !Array.isArray(game.actions) ||
    typeof game.ending !== 'object' ||
    game.ending === null
  ) {
    throw new SavedGameError('This saved game is missing part of itself.')
  }

  return parsed as SavedGame
}
