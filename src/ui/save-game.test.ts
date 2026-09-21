import { describe, expect, it } from 'vitest'

import type { SavedGame } from '../engine'
import { fileNameFor } from './save-game'

describe('a saved game gets a name that says what it was', () => {
  it('names the date, the time and who played, and sorts by date', () => {
    const saved = {
      savedAt: '2026-09-21T16:04',
      first: {
        players: [{ kind: 'planner' }, { kind: 'optimus' }, { kind: 'general' }, { kind: 'turtle' }],
      },
    } as unknown as SavedGame

    expect(fileNameFor(saved)).toBe(
      'conquest-2026-09-21-16-04-planner-optimus-general-turtle.json',
    )
  })
})
