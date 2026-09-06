import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import type { GameMap } from './types'
import type { Board } from './reinforce'
import {
  ownsWholeRegion,
  regionBonusFor,
  reinforcementsFor,
  territoriesOwnedBy,
} from './reinforce'

/** A board where one player owns the territories named, and another the rest. */
function boardWhere(owned: readonly string[]): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const territory of AUSTRALIA.territories) {
    board[territory.id] = {
      ownerId: owned.includes(territory.id) ? 'me' : 'them',
      armies: 1,
    }
  }

  return board
}

const THE_WEST = ['wa', 'rot', 'nt']
const THE_SOUTH = ['sa', 'tas']

describe('counting what a player owns', () => {
  it('lists only that player territories', () => {
    expect(territoriesOwnedBy(boardWhere(['wa', 'sa']), 'me').sort()).toEqual([
      'sa',
      'wa',
    ])
  })

  it('returns nothing for a player who owns nothing', () => {
    expect(territoriesOwnedBy(boardWhere([]), 'me')).toEqual([])
  })
})

describe('owning a whole region', () => {
  it('is true when the player holds every territory in it', () => {
    expect(ownsWholeRegion(AUSTRALIA, boardWhere(THE_WEST), 'me', 'west')).toBe(
      true,
    )
  })

  it('is false when one territory is missing', () => {
    const almost = THE_WEST.filter((id) => id !== 'rot')

    expect(ownsWholeRegion(AUSTRALIA, boardWhere(almost), 'me', 'west')).toBe(
      false,
    )
  })

  it('is false for a region that does not exist', () => {
    expect(
      ownsWholeRegion(AUSTRALIA, boardWhere(THE_WEST), 'me', 'atlantis'),
    ).toBe(false)
  })
})

describe('the region bonus', () => {
  it('is nothing when the player holds no whole region', () => {
    expect(regionBonusFor(AUSTRALIA, boardWhere(['wa', 'sa']), 'me')).toBe(0)
  })

  it('is the region bonus when the player holds one region', () => {
    // The West is worth 3.
    expect(regionBonusFor(AUSTRALIA, boardWhere(THE_WEST), 'me')).toBe(3)
  })

  it('adds up when the player holds two regions', () => {
    // The West is 3, The South is 2.
    expect(
      regionBonusFor(AUSTRALIA, boardWhere([...THE_WEST, ...THE_SOUTH]), 'me'),
    ).toBe(5)
  })
})

describe('reinforcements at the start of a turn', () => {
  it('gives the minimum of three to a player holding almost nothing', () => {
    expect(reinforcementsFor(AUSTRALIA, boardWhere(['tas']), 'me')).toBe(3)
  })

  // The rule that lets a beaten player come back. Without it, two territories
  // would earn nothing at all.
  it('still gives three to a player down to two territories', () => {
    expect(reinforcementsFor(AUSTRALIA, boardWhere(['tas', 'wa']), 'me')).toBe(
      3,
    )
  })

  // Australia has only 10 territories, so a third of them is 3, which merely
  // ties the minimum. On this map the divide-by-three rule can never show
  // itself. A bigger map is the only way to test it, so here is one.
  it('gives one army per three territories on a map big enough to show it', () => {
    const big = longThinMap(30)
    const all = big.territories.map((each) => each.id)

    // 30 territories over 3 is 10 armies. The one region is worth 0.
    expect(reinforcementsFor(big, boardOf(big, all), 'me')).toBe(10)
  })

  it('rounds the division down', () => {
    const big = longThinMap(30)
    // 20 territories over 3 is 6 and two thirds, which rounds down to 6.
    const twenty = big.territories.slice(0, 20).map((each) => each.id)

    expect(reinforcementsFor(big, boardOf(big, twenty), 'me')).toBe(6)
  })

  it('adds the region bonus on top', () => {
    // The West is 3 territories, so 1 army from territories, lifted to the
    // minimum of 3, plus the region bonus of 3.
    expect(reinforcementsFor(AUSTRALIA, boardWhere(THE_WEST), 'me')).toBe(6)
  })

  it('gives the whole map holder everything', () => {
    const everything = AUSTRALIA.territories.map((each) => each.id)

    // 10 territories is 3 armies, and every region bonus is 3 + 2 + 3 + 2.
    expect(reinforcementsFor(AUSTRALIA, boardWhere(everything), 'me')).toBe(13)
  })
})

/**
 * A map of however many territories, each bordering the next, all in one
 * region worth nothing. It exists so a test can reach territory counts that
 * Australia is too small to produce.
 */
function longThinMap(size: number): GameMap {
  return {
    id: 'long-thin',
    name: 'Long thin map',
    viewBox: '0 0 1000 100',
    regions: [{ id: 'all', name: 'All', bonus: 0, outline: '#000000' }],
    territories: Array.from({ length: size }, (_unused, index) => ({
      id: `t${index}`,
      name: `Territory ${index}`,
      shortName: `T${index}`,
      regionId: 'all',
      borders: [index - 1, index + 1]
        .filter((next) => next >= 0 && next < size)
        .map((next) => `t${next}`),
      shape: 'M 0 0 L 10 0 L 10 10 Z',
      labelAt: { x: 5, y: 5 },
    })),
  }
}

/** A board for any map, where 'me' owns the territories named. */
function boardOf(map: GameMap, owned: readonly string[]): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const territory of map.territories) {
    board[territory.id] = {
      ownerId: owned.includes(territory.id) ? 'me' : 'them',
      armies: 1,
    }
  }

  return board
}
