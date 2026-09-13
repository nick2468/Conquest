import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GENERAL_SETTINGS } from './general'
import { OPTIMUS_DUEL, OPTIMUS_LATE, OPTIMUS_SETTINGS } from './optimus'

/**
 * The guard for a bug that hid for weeks. Plan task 4.53.
 *
 * The General and Optimus are the same code with different numbers. The
 * code reads them through one variable, `rules`, which is set at the top of
 * every turn to whichever set applies: the General's, Optimus's, the
 * coalesced-board set, or the one-opponent-left set.
 *
 * One line read `GENERAL_SETTINGS.leaveItToOthers` directly. So Optimus
 * threw away its own tuned 0.25 and quietly used the General's 0.3. Nothing
 * failed. The tuner went on "tuning" a number that was never read, and a
 * sweep of every dial at 1200 games found this one moved NOTHING at any
 * value, which is what gave it away.
 *
 * A rule nobody checks is a rule that breaks, so this checks it by reading
 * the source. See spec S31.
 */

const SOURCE = join(process.cwd(), 'src', 'engine', 'players', 'general.ts')

/** The file with its comments taken out, so a comment cannot fail it. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('a setting is read through `rules`, never from one player', () => {
  it('names GENERAL_SETTINGS only where it is declared or spread', () => {
    const code = codeOnly(readFileSync(SOURCE, 'utf8'))
    const uses = [...code.matchAll(/GENERAL_SETTINGS\s*\.\s*(\w+)/g)]

    expect(
      uses.map((each) => each[1]),
      'Read the setting from `rules`, not from GENERAL_SETTINGS. Optimus ' +
        'shares this code, so naming one player\'s numbers throws away the ' +
        'other\'s. See plan task 4.53.',
    ).toEqual([])
  })

  it('proves the check would catch it', () => {
    // The bug as it really was, so we know the pattern matches.
    const broken = codeOnly('  return someoneElseCan ? GENERAL_SETTINGS.leaveItToOthers : 1')

    expect([...broken.matchAll(/GENERAL_SETTINGS\s*\.\s*(\w+)/g)]).toHaveLength(1)

    // And that a comment naming it does NOT fail.
    const innocent = codeOnly('  // stays as in GENERAL_SETTINGS.leaveItToOthers\n  return 1')

    expect([...innocent.matchAll(/GENERAL_SETTINGS\s*\.\s*(\w+)/g)]).toHaveLength(0)
  })
})

describe('every player carries every dial', () => {
  it('gives Optimus a value for everything the General has', () => {
    expect(Object.keys(OPTIMUS_SETTINGS).sort()).toEqual(
      Object.keys(GENERAL_SETTINGS).sort(),
    )
  })

  it('only lets the later sets change dials that exist', () => {
    for (const [name, later] of [
      ['OPTIMUS_LATE', OPTIMUS_LATE],
      ['OPTIMUS_DUEL', OPTIMUS_DUEL],
    ] as const) {
      for (const dial of Object.keys(later)) {
        expect(
          Object.keys(GENERAL_SETTINGS),
          `${name} sets "${dial}", which is not a dial.`,
        ).toContain(dial)
      }
    }
  })
})
