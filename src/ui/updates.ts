/**
 * Telling the player when a new version is ready.
 *
 * The service worker is set to WAIT rather than update on its own, because
 * a game in progress lives only in memory and an automatic reload would
 * throw it away. See the comment in vite.config.ts.
 *
 * The cost of waiting is that an update is invisible: Nick had no way to
 * know whether the iPad was running the newest version short of looking for
 * a feature and guessing. This makes it visible without making it forced.
 *
 * No React here, so the wording is tested without a browser.
 */

export interface UpdateNotice {
  readonly heading: string
  readonly detail: string
  readonly confirmLabel: string
}

/**
 * What to say about a waiting update.
 *
 * The message changes with what it would cost. Mid-game, loading a new
 * version ends the game, and the player deserves to be told that BEFORE
 * they press it rather than after.
 */
export function updateNotice(gameInProgress: boolean): UpdateNotice {
  if (!gameInProgress) {
    return {
      heading: 'A new version is ready',
      detail: 'Nothing is in progress, so it costs nothing to load it now.',
      confirmLabel: 'Load it',
    }
  }

  return {
    heading: 'A new version is ready',
    detail:
      'Loading it will end the game you are playing, because a game is not ' +
      'saved anywhere. Finish first if you would rather.',
    confirmLabel: 'Load it and start again',
  }
}
