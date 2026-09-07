import { describe, expect, it } from 'vitest'

import type { GameMap, TerritoryDefinition } from '../engine'
import { AUSTRALIA } from './australia'
import { AUSTRALIA_BIG } from './australia-big'
import { cornersOf, isWithin, overlapBetween, roomTakenBy } from './shapes'
import { validateMap } from './validate'

/**
 * Checks 9 and 10, the two guards from plan tasks 2.2.8 and 2.1.5.
 *
 * A guard nobody has watched fail is not a guard. Every test here feeds it
 * a map with one thing wrong and insists it says so.
 *
 * The tests where it must say NOTHING matter just as much. A check that
 * reported every border on the map as an overlap would be worse than no
 * check at all, because it would be turned off within a day.
 */

function twoSquares(): GameMap {
  return {
    id: 'squares',
    name: 'Two squares',
    viewBox: '0 0 100 100',
    regions: [{ id: 'r1', name: 'Region one', bonus: 1, outline: '#000000' }],
    territories: [
      {
        id: 'left',
        name: 'Left',
        shortName: 'L',
        regionId: 'r1',
        borders: ['right'],
        shape: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
        labelAt: { x: 5, y: 5 },
      },
      {
        id: 'right',
        name: 'Right',
        shortName: 'R',
        regionId: 'r1',
        borders: ['left'],
        shape: 'M 10 0 L 20 0 L 20 10 L 10 10 Z',
        labelAt: { x: 15, y: 5 },
      },
    ],
  }
}

function changing(
  map: GameMap,
  id: string,
  changes: Partial<TerritoryDefinition>,
): GameMap {
  return {
    ...map,
    territories: map.territories.map((territory) =>
      territory.id === id ? { ...territory, ...changes } : territory,
    ),
  }
}

function complaints(map: GameMap, rule: string): string[] {
  return validateMap(map)
    .filter((problem) => problem.rule === rule)
    .map((problem) => problem.message)
}

describe('the arithmetic underneath', () => {
  const square: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ]

  it('knows a point in the middle is inside', () => {
    expect(isWithin([5, 5], square)).toBe(true)
  })

  it('knows a point outside is outside', () => {
    expect(isWithin([15, 5], square)).toBe(false)
  })

  it('does NOT count a point on the outline as inside', () => {
    // Everything rests on this. Two places that share a border share their
    // corners exactly, so every shared corner sits on the neighbour's
    // outline. Counting those as inside would report every border as an
    // overlap.
    expect(isWithin([10, 5], square)).toBe(false)
    expect(isWithin([0, 0], square)).toBe(false)
  })

  it('measures how much ground a shape covers', () => {
    expect(roomTakenBy(square)).toBe(100)
  })

  it('reads the corners back out of a drawn shape', () => {
    expect(cornersOf('M 0 0 L 10 0 L 10 10 Z')).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ])
  })
})

describe('check 9: no two places claim the same ground', () => {
  it('says nothing when two places only share a border', () => {
    expect(complaints(twoSquares(), 'no two places overlap')).toEqual([])
  })

  it('catches two places covering the same ground', () => {
    const broken = changing(twoSquares(), 'right', {
      shape: 'M 5 0 L 20 0 L 20 10 L 5 10 Z',
      labelAt: { x: 18, y: 5 },
    })

    const said = complaints(broken, 'no two places overlap')

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('"Left"')
    expect(said[0]).toContain('"Right"')
  })

  it('catches a crossing where no corner lands inside the other', () => {
    // A tall thin place laid across a wide flat one, like a plus sign.
    // Neither has a corner inside the other, and they plainly overlap.
    // This is the case a corners-only check would walk straight past.
    const across: GameMap = {
      ...twoSquares(),
      territories: [
        {
          ...(twoSquares().territories[0] as TerritoryDefinition),
          shape: 'M 0 4 L 20 4 L 20 6 L 0 6 Z',
          labelAt: { x: 40, y: 40 },
        },
        {
          ...(twoSquares().territories[1] as TerritoryDefinition),
          shape: 'M 8 0 L 12 0 L 12 10 L 8 10 Z',
          labelAt: { x: 60, y: 60 },
        },
      ],
    }

    expect(complaints(across, 'no two places overlap')).toHaveLength(1)
  })

  it('allows a city that says it is drawn over the place around it', () => {
    const city = changing(twoSquares(), 'right', {
      shape: 'M 3 3 L 6 3 L 6 6 L 3 6 Z',
      labelAt: { x: 40, y: 40 },
      drawnOver: 'left',
    })

    expect(complaints(city, 'no two places overlap')).toEqual([])
    expect(complaints(city, 'drawn over')).toEqual([])
  })

  it('catches a city drawn over a place it does not border', () => {
    const lonely = changing(twoSquares(), 'right', {
      shape: 'M 3 3 L 6 3 L 6 6 L 3 6 Z',
      labelAt: { x: 40, y: 40 },
      drawnOver: 'left',
      borders: [],
    })

    expect(complaints(lonely, 'drawn over').join(' ')).toContain(
      'do not border each other',
    )
  })

  it('catches a city drawn over a place it does not touch', () => {
    const adrift = changing(twoSquares(), 'right', {
      shape: 'M 50 50 L 53 50 L 53 53 L 50 53 Z',
      labelAt: { x: 70, y: 70 },
      drawnOver: 'left',
    })

    expect(complaints(adrift, 'drawn over').join(' ')).toContain('do not touch')
  })

  it('catches the claim made the wrong way round', () => {
    const backwards = changing(
      changing(twoSquares(), 'right', {
        shape: 'M 3 3 L 6 3 L 6 6 L 3 6 Z',
        labelAt: { x: 40, y: 40 },
      }),
      'left',
      { drawnOver: 'right' },
    )

    expect(complaints(backwards, 'drawn over').join(' ')).toContain(
      'not the smaller of the two',
    )
  })

  it('catches a place drawn over one that does not exist', () => {
    const missing = changing(twoSquares(), 'right', { drawnOver: 'narnia' })

    expect(complaints(missing, 'drawn over').join(' ')).toContain('no such')
  })

  it('catches a place drawn over itself', () => {
    const itself = changing(twoSquares(), 'right', { drawnOver: 'right' })

    expect(complaints(itself, 'drawn over').join(' ')).toContain(
      'drawn over itself',
    )
  })
})

describe('check 10: no army count sits on somebody else', () => {
  it('says nothing when each count is on its own land', () => {
    expect(complaints(twoSquares(), 'counts are clear')).toEqual([])
  })

  it('catches a count that has drifted onto the neighbour', () => {
    const drifted = changing(twoSquares(), 'left', { labelAt: { x: 15, y: 5 } })
    const said = complaints(drifted, 'counts are clear')

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('"Right"')
  })

  it('allows a count out past the coast, on nothing at all', () => {
    // Rottnest and the Whitsundays are too small to hold a number, so
    // theirs sit in the sea with a line pointing at them.
    const atSea = changing(twoSquares(), 'left', { labelAt: { x: 50, y: 50 } })

    expect(complaints(atSea, 'counts are clear')).toEqual([])
  })

  it('allows a city count to sit on the place the city is drawn over', () => {
    // This is Perth. Its own shape is too small to hold the number, so the
    // number sits beside it, on The South West.
    const city = changing(
      changing(twoSquares(), 'right', {
        shape: 'M 3 3 L 6 3 L 6 6 L 3 6 Z',
        labelAt: { x: 8, y: 8 },
        drawnOver: 'left',
      }),
      // Out of the city's way, or Left's own count would be the fault.
      'left',
      { labelAt: { x: 1, y: 8 } },
    )

    expect(complaints(city, 'counts are clear')).toEqual([])
  })
})

describe('the maps we ship', () => {
  it('has no two places sharing ground, on either map', () => {
    expect(complaints(AUSTRALIA_BIG, 'no two places overlap')).toEqual([])
    expect(complaints(AUSTRALIA, 'no two places overlap')).toEqual([])
  })

  it('has every count clear, on either map', () => {
    expect(complaints(AUSTRALIA_BIG, 'counts are clear')).toEqual([])
    expect(complaints(AUSTRALIA, 'counts are clear')).toEqual([])
  })

  it('keeps The Far West and The Riverina apart', () => {
    // Its own test with its own name, because this one was real and it was
    // still in the map. The Riverina's northern edge was one straight line
    // trying to meet two neighbours whose southern edges are a unit apart,
    // so it cut half a unit into The Far West. Nothing on screen was ever
    // going to show that.
    const shapeOf = (id: string): string =>
      AUSTRALIA_BIG.territories.find((each) => each.id === id)?.shape ?? ''

    expect(
      overlapBetween(cornersOf(shapeOf('farWest')), cornersOf(shapeOf('riverina'))),
    ).toBeNull()
  })

  it('declares every city that is drawn over a place', () => {
    const cities = AUSTRALIA_BIG.territories
      .filter((each) => each.drawnOver !== undefined)
      .map((each) => `${each.id} over ${each.drawnOver ?? ''}`)

    expect(cities.sort()).toEqual([
      'act over riverina',
      'adelaide over riverland',
      'darwin over topEnd',
      'melbourne over westVic',
      'perth over southWest',
      'sydney over hunter',
    ])
  })
})
