import { describe, expect, it } from 'vitest'

import { entrancesTo } from '../engine'
import { WORLD } from './world'
import { assertValidMap, validateMap } from './validate'

describe('the world map', () => {
  // About two seconds on a quiet machine, because the overlap rules compare
  // every pair of shapes point by point. It timed out twice under the usual
  // five-second limit while tournaments were running, so it gets room.
  it('obeys every rule a map must obey', () => {
    expect(validateMap(WORLD).map((problem) => problem.message)).toEqual([])
    expect(() => assertValidMap(WORLD)).not.toThrow()
  }, 30_000)

  it('has 42 places in 6 continents', () => {
    expect(WORLD.territories).toHaveLength(42)
    expect(WORLD.regions).toHaveLength(6)
  })

  it('gives every continent the number of places it should have', () => {
    const counted = (id: string): number =>
      WORLD.territories.filter((each) => each.regionId === id).length

    expect(counted('northAmerica')).toBe(9)
    expect(counted('southAmerica')).toBe(4)
    expect(counted('europe')).toBe(7)
    expect(counted('africa')).toBe(6)
    expect(counted('asia')).toBe(12)
    expect(counted('australiaRegion')).toBe(4)
  })

  it('gives Australia ONE way in, which is what makes it worth having', () => {
    // The same lesson Tasmania teaches on the detailed Australia map. It
    // pays the least of any continent and wins games, because a bonus you
    // can keep beats a bigger one you cannot.
    // entrancesTo names the place OUTSIDE that can attack in. For
    // Australia there is exactly one in the whole world, and it is Siam.
    expect(entrancesTo(WORLD, 'australiaRegion')).toEqual(['siam'])
  })

  it('makes Asia pay the most and be the hardest to hold', () => {
    const asia = entrancesTo(WORLD, 'asia')

    expect(WORLD.regions.find((each) => each.id === 'asia')?.bonus).toBe(7)
    expect(asia.length).toBeGreaterThan(3)
  })

  it('lets Australia be reached only across water', () => {
    const indonesia = WORLD.territories.find((each) => each.id === 'indonesia')

    expect(indonesia?.isIsland).toBe(true)
    expect(indonesia?.borders).toContain('siam')
  })

  it('joins the two halves of the board across the Bering Strait', () => {
    // Without Alaska to Kamchatka the board is two boards, and rule 8 would
    // say so. This names the crossing that holds it together.
    const alaska = WORLD.territories.find((each) => each.id === 'alaska')

    expect(alaska?.borders).toContain('kamchatka')
  })
})
