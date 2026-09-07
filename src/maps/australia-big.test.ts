import { describe, expect, it } from 'vitest'

import { entrancesTo } from '../engine'
import { AUSTRALIA_BIG } from './australia-big'
import { validateMap } from './validate'

describe('the detailed Australia map', () => {
  it('passes every check', () => {
    expect(validateMap(AUSTRALIA_BIG)).toEqual([])
  })

  it('is big enough for a plan to matter', () => {
    // Plan task 4.13 measured the Planner beating Cautious 6 games in 10 on
    // a board of about this size, and level on a board of ten territories.
    expect(AUSTRALIA_BIG.territories.length).toBeGreaterThanOrEqual(35)
    expect(AUSTRALIA_BIG.regions.length).toBeGreaterThanOrEqual(6)
  })

  it('gives every region at least three places', () => {
    for (const region of AUSTRALIA_BIG.regions) {
      const inside = AUSTRALIA_BIG.territories.filter(
        (each) => each.regionId === region.id,
      )

      expect(inside.length, region.name).toBeGreaterThanOrEqual(3)
    }
  })

  // The whole reason for building this map. A region with one way in is a
  // base worth fighting for, and a board with no such region gives a
  // planning player nothing to plan.
  it('makes Tasmania the one-door prize', () => {
    expect(entrancesTo(AUSTRALIA_BIG, 'tas')).toEqual(['melbourne'])
  })

  it('makes the mainland regions harder to hold than Tasmania', () => {
    const tasmania = entrancesTo(AUSTRALIA_BIG, 'tas').length

    for (const region of AUSTRALIA_BIG.regions) {
      if (region.id === 'tas') {
        continue
      }

      expect(
        entrancesTo(AUSTRALIA_BIG, region.id).length,
        region.name,
      ).toBeGreaterThan(tasmania)
    }
  })

  it('has the cities Nick asked for', () => {
    const cities = [
      'perth', 'darwin', 'brisbane', 'adelaide', 'sydney', 'act',
      'melbourne', 'hobart',
    ]

    for (const city of cities) {
      expect(
        AUSTRALIA_BIG.territories.some((each) => each.id === city),
        city,
      ).toBe(true)
    }
  })
})
