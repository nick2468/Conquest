import { describe, expect, it } from 'vitest'

import { updateNotice } from './updates'

describe('telling the player a new version is ready', () => {
  it('says so either way', () => {
    for (const playing of [true, false]) {
      expect(updateNotice(playing).heading).toContain('new version')
    }
  })

  /**
   * The one thing this must not do is hide the cost.
   *
   * A game lives only in memory, so loading a new version ends it. That is
   * the deliberate trade in vite.config.ts: the worker WAITS rather than
   * reloading on its own. A player who presses the button mid-game has to
   * have been told what it does BEFORE pressing it, not after.
   */
  it('warns that a game in progress will be lost', () => {
    const notice = updateNotice(true)

    expect(notice.detail).toContain('end the game')
    expect(notice.detail).toContain('not saved')
    expect(notice.confirmLabel).toContain('start again')
  })

  it('says it costs nothing when no game is running', () => {
    const notice = updateNotice(false)

    expect(notice.detail).toContain('costs nothing')
    expect(notice.detail).not.toContain('end the game')
    expect(notice.confirmLabel).toBe('Load it')
  })

  it('never leaves a button unlabelled', () => {
    for (const playing of [true, false]) {
      expect(updateNotice(playing).confirmLabel.length).toBeGreaterThan(3)
    }
  })
})
