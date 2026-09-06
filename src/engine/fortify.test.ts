import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import {
  armiesAvailableToMove,
  canFortify,
  fortifyProblem,
  fortifyTargets,
} from './fortify'
import type { Board } from './types'

/**
 * A board where 'me' owns the territories named with the armies given, and
 * 'them' owns everything else with one army each.
 */
function boardWhere(mine: Readonly<Record<string, number>>): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const territory of AUSTRALIA.territories) {
    const armies = mine[territory.id]

    board[territory.id] =
      armies === undefined
        ? { ownerId: 'them', armies: 1 }
        : { ownerId: 'me', armies }
  }

  return board
}

describe('armies available to move', () => {
  it('is one less than the armies there, because one stays behind', () => {
    expect(armiesAvailableToMove(boardWhere({ wa: 5 }), 'wa')).toBe(4)
  })

  it('is nothing when only one army is there', () => {
    expect(armiesAvailableToMove(boardWhere({ wa: 1 }), 'wa')).toBe(0)
  })

  it('is nothing for a territory that does not exist', () => {
    expect(armiesAvailableToMove(boardWhere({}), 'atlantis')).toBe(0)
  })
})

describe('where you may move to, adjacent only', () => {
  it('offers only territories you own across a border', () => {
    // Western Australia borders nt, sa and rot. Own wa and nt only.
    const board = boardWhere({ wa: 5, nt: 2 })

    expect(fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'adjacent')).toEqual([
      'nt',
    ])
  })

  it('offers nothing when no neighbour is yours', () => {
    expect(
      fortifyTargets(AUSTRALIA, boardWhere({ wa: 5 }), 'me', 'wa', 'adjacent'),
    ).toEqual([])
  })

  // The difference between the two settings, in one test.
  it('does NOT offer a territory two steps away', () => {
    // wa to nt to qld. Own all three. Adjacent should stop at nt.
    const board = boardWhere({ wa: 5, nt: 2, qld: 2 })

    expect(
      fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'adjacent'),
    ).not.toContain('qld')
  })
})

describe('where you may move to, any connected distance', () => {
  it('offers a territory two steps away through your own land', () => {
    const board = boardWhere({ wa: 5, nt: 2, qld: 2 })

    expect(
      fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'connected'),
    ).toContain('qld')
  })

  it('will not walk through a territory somebody else owns', () => {
    // wa and qld are yours, but nt and sa in between are not. The only paths
    // from wa go through nt or sa, so qld cannot be reached.
    const board = boardWhere({ wa: 5, qld: 2 })

    expect(
      fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'connected'),
    ).not.toContain('qld')
  })

  it('reaches the far end of a long chain', () => {
    // wa - sa - vic - tas, all yours.
    const board = boardWhere({ wa: 9, sa: 1, vic: 1, tas: 1 })

    expect(
      fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'connected'),
    ).toContain('tas')
  })

  it('never offers the territory you started from', () => {
    const board = boardWhere({ wa: 5, nt: 2 })

    expect(
      fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'connected'),
    ).not.toContain('wa')
  })

  it('offers nothing from a territory you do not own', () => {
    const board = boardWhere({ nt: 2 })

    expect(fortifyTargets(AUSTRALIA, board, 'me', 'wa', 'connected')).toEqual(
      [],
    )
  })
})

describe('making the move', () => {
  const board = boardWhere({ wa: 5, nt: 2, qld: 2 })

  it('allows a move between two neighbours you own', () => {
    expect(canFortify(AUSTRALIA, board, 'me', 'wa', 'nt', 4, 'adjacent')).toBe(
      true,
    )
  })

  it('refuses a move out of a territory you do not own', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'sa', 'wa', 1, 'connected'),
    ).toMatch(/do not own "sa"/)
  })

  it('refuses a move into a territory you do not own', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'sa', 1, 'connected'),
    ).toMatch(/do not own "sa"/)
  })

  it('refuses a move to where the armies already are', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'wa', 1, 'connected'),
    ).toMatch(/already there/)
  })

  it('refuses moving no armies', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'nt', 0, 'adjacent'),
    ).toMatch(/at least one army/)
  })

  // One army must always stay behind. Moving all 5 out of wa would empty it.
  it('refuses a move that would leave the territory empty', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'nt', 5, 'adjacent'),
    ).toMatch(/at most 4 armies/)
  })

  it('allows exactly the armies available', () => {
    expect(canFortify(AUSTRALIA, board, 'me', 'wa', 'nt', 4, 'adjacent')).toBe(
      true,
    )
  })
})

describe('the two distance settings really do differ', () => {
  // wa - nt - qld, all owned. The same move is legal under one setting and
  // not the other. If this ever stops being true, the setting does nothing.
  const board = boardWhere({ wa: 5, nt: 2, qld: 2 })

  it('refuses the two-step move when adjacent only', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'qld', 2, 'adjacent'),
    ).toMatch(/does not border/)
  })

  it('allows the same move when any connected distance', () => {
    expect(
      fortifyProblem(AUSTRALIA, board, 'me', 'wa', 'qld', 2, 'connected'),
    ).toBeNull()
  })

  it('explains a broken path in words that say what is wrong', () => {
    const broken = boardWhere({ wa: 5, qld: 2 })

    expect(
      fortifyProblem(AUSTRALIA, broken, 'me', 'wa', 'qld', 2, 'connected'),
    ).toMatch(/no path from "wa" to "qld"/)
  })
})
