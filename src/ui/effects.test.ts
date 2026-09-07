import { describe, expect, it } from 'vitest'

import { AUSTRALIA_BIG } from '../maps/australia-big'
import { AUSTRALIA } from '../maps/australia'
import { crossesWater, effectFor, towardsTheSea } from './effects'
import { middleOf, middleOfMap } from './zoom'

/** Plan task 7.2. All of this runs with no browser. */

const map = AUSTRALIA_BIG

function place(id: string) {
  const found = map.territories.find((each) => each.id === id)

  if (found === undefined) {
    throw new Error(`no such place: ${id}`)
  }

  return found
}

describe('what to draw for an attack', () => {
  it('puts the fight between the two places, not on either of them', () => {
    const effect = effectFor(map, {
      type: 'attack',
      fromId: 'launceston',
      toId: 'hobart',
    })

    const from = middleOf(place('launceston'))
    const to = middleOf(place('hobart'))

    expect(effect?.kind).toBe('battle')
    expect(effect?.at.x).toBeCloseTo((from.x + to.x) / 2)
    expect(effect?.at.y).toBeCloseTo((from.y + to.y) / 2)
  })

  it('lasts less than the pause a computer takes after a fight', () => {
    const effect = effectFor(map, {
      type: 'attack',
      fromId: 'launceston',
      toId: 'hobart',
    })

    // App.tsx waits 1500 milliseconds after an attack.
    expect(effect?.lasting).toBeLessThan(1500)
  })
})

describe('what to draw when armies arrive', () => {
  it('sends landing craft to an island', () => {
    const effect = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'rottnest',
      count: 1,
    })

    expect(effect?.kind).toBe('landing')
  })

  it('drops parachutists anywhere inland', () => {
    const effect = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'redCentre',
      count: 1,
    })

    expect(effect?.kind).toBe('parachute')
    expect(effect?.comingFrom).toBeNull()
  })

  it('brings the landing craft in from the open sea, not over the land', () => {
    // Rottnest sits west of Perth, so its sea is to the west: a negative x.
    const rottnest = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'rottnest',
      count: 1,
    })

    expect(rottnest?.comingFrom?.x).toBeLessThan(0)

    // The Whitsundays sit east of Queensland, so their sea is to the east.
    const whitsunday = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'whitsunday',
      count: 1,
    })

    expect(whitsunday?.comingFrom?.x).toBeGreaterThan(0)

    // Tasmania is at the bottom of the map, so its sea is to the south. On
    // a screen, south is a larger y.
    const hobart = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'hobart',
      count: 1,
    })

    expect(hobart?.comingFrom?.y).toBeGreaterThan(0)
  })

  it('gives the direction a length of one, so the drawing sets the distance', () => {
    const effect = effectFor(map, {
      type: 'placeArmies',
      territoryId: 'rottnest',
      count: 1,
    })
    const way = effect?.comingFrom

    expect(Math.hypot(way?.x ?? 0, way?.y ?? 0)).toBeCloseTo(1)
  })

  it('points somewhere even for a place exactly in the middle', () => {
    const way = towardsTheSea(map, middleOfMap(map))

    expect(Math.hypot(way.x, way.y)).toBeCloseTo(1)
  })
})

describe('what to draw when armies move', () => {
  it('runs a convoy from where they leave to where they land', () => {
    const effect = effectFor(map, {
      type: 'fortify',
      fromId: 'hobart',
      toId: 'launceston',
      count: 2,
    })

    expect(effect?.kind).toBe('convoy')
    expect(effect?.from).toEqual(middleOf(place('hobart')))
    expect(effect?.at).toEqual(middleOf(place('launceston')))
  })
})

describe('armies that have to cross water', () => {
  it('knows Bass Strait is water and the road to Hobart is not', () => {
    expect(crossesWater(map, 'melbourne', 'launceston')).toBe(true)
    expect(crossesWater(map, 'launceston', 'hobart')).toBe(false)
    expect(crossesWater(map, 'perth', 'rottnest')).toBe(true)
    expect(crossesWater(map, 'sydney', 'melbourne')).toBe(false)
  })

  it('sends boats rather than lorries when armies cross to an island', () => {
    const effect = effectFor(map, {
      type: 'fortify',
      fromId: 'melbourne',
      toId: 'launceston',
      count: 3,
    })

    expect(effect?.kind).toBe('landing')
  })

  it('brings those boats in from the place the armies left', () => {
    const effect = effectFor(map, {
      type: 'fortify',
      fromId: 'melbourne',
      toId: 'launceston',
      count: 3,
    })

    // Melbourne is north west of Launceston, so the boats come from there:
    // a negative x and a negative y.
    expect(effect?.comingFrom?.x).toBeLessThan(0)
    expect(effect?.comingFrom?.y).toBeLessThan(0)
  })

  it('still sends lorries when the whole journey is on land', () => {
    const effect = effectFor(map, {
      type: 'fortify',
      fromId: 'launceston',
      toId: 'hobart',
      count: 2,
    })

    expect(effect?.kind).toBe('convoy')
  })
})

describe('actions with nothing to show', () => {
  const nothing = [
    { type: 'endAttackPhase' },
    { type: 'skipFortify' },
    { type: 'tradeCards', cardIds: ['a', 'b', 'c'] },
    { type: 'occupy', count: 3 },
  ] as const

  for (const action of nothing) {
    it(`draws nothing for ${action.type}`, () => {
      expect(effectFor(map, action)).toBeNull()
    })
  }

  it('draws nothing for a place that is not on the map', () => {
    expect(
      effectFor(map, { type: 'placeArmies', territoryId: 'narnia', count: 1 }),
    ).toBeNull()
  })
})

describe('both maps agree about which places are islands', () => {
  it('marks the islands on the detailed map', () => {
    const islands = AUSTRALIA_BIG.territories
      .filter((each) => each.isIsland === true)
      .map((each) => each.id)

    expect(islands.sort()).toEqual([
      'hobart',
      'launceston',
      'rottnest',
      'westCoast',
      'whitsunday',
    ])
  })

  it('marks the islands on the small map', () => {
    const islands = AUSTRALIA.territories
      .filter((each) => each.isIsland === true)
      .map((each) => each.id)

    expect(islands.sort()).toEqual(['rot', 'tas', 'whit'])
  })

  it('never calls a mainland capital an island', () => {
    for (const id of ['perth', 'darwin', 'adelaide', 'sydney', 'melbourne']) {
      expect(place(id).isIsland ?? false).toBe(false)
    }
  })
})
