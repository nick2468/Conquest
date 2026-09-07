import { describe, expect, it } from 'vitest'

import { AUSTRALIA_BIG } from '../maps/australia-big'
import type { MapDraft } from '../maps/format'
import { fromDraft, toDraft } from '../maps/format'
import { validateMap } from '../maps/validate'
import {
  SNAP_WITHIN,
  addedPlace,
  bordersFromShapes,
  changedPlace,
  changedRegion,
  cornersIn,
  freeId,
  insertedCorner,
  movedCorner,
  movedLabel,
  removedCorner,
  removedPlace,
  removedRegion,
  snapped,
  squareAt,
} from './edits'

/** Plan task 5.9. All of it runs with no browser. */

function tiny(): MapDraft {
  return {
    id: 'tiny',
    name: 'Tiny',
    viewBox: '0 0 100 100',
    regions: [
      { id: 'r1', name: 'Region one', bonus: 2, outline: '#b8763a' },
      { id: 'r2', name: 'Region two', bonus: 1, outline: '#3a6ea8' },
    ],
    places: [
      {
        id: 'left',
        name: 'Left',
        shortName: 'L',
        region: 'r1',
        borders: ['right'],
        corners: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        labelAt: [5, 5],
      },
      {
        id: 'right',
        name: 'Right',
        shortName: 'R',
        region: 'r1',
        borders: ['left'],
        corners: [
          [10, 0],
          [20, 0],
          [20, 10],
          [10, 10],
        ],
        labelAt: [15, 5],
      },
    ],
  }
}

function placeIn(draft: MapDraft, id: string) {
  const found = draft.places.find((place) => place.id === id)

  if (found === undefined) {
    throw new Error(`no such place: ${id}`)
  }

  return found
}

describe('snapping a corner onto one already there', () => {
  it('is what keeps two places sharing an exact border', () => {
    // Nobody can click the same point twice by hand, and a border that is
    // a hair out is the fault the whole corner format exists to prevent.
    const near = snapped([10.4, 0.3], cornersIn(tiny(), 'left'))

    expect(near).toEqual([10, 0])
  })

  it('leaves a point alone when nothing is near it', () => {
    expect(snapped([60, 60], cornersIn(tiny()))).toEqual([60, 60])
  })

  it('takes the nearest of several', () => {
    const onto: Array<[number, number]> = [
      [10, 0],
      [12, 0],
    ]

    expect(snapped([11.4, 0], onto)).toEqual([12, 0])
  })

  it('leaves out the place being moved, so it cannot snap to itself', () => {
    expect(cornersIn(tiny(), 'left')).toHaveLength(4)
    expect(cornersIn(tiny())).toHaveLength(8)
  })

  it('snaps within the distance and not beyond it', () => {
    const just: Array<[number, number]> = [[0, 0]]

    expect(snapped([SNAP_WITHIN - 0.1, 0], just)).toEqual([0, 0])
    expect(snapped([SNAP_WITHIN + 0.1, 0], just)).not.toEqual([0, 0])
  })
})

describe('changing a shape', () => {
  it('moves one corner and leaves the rest', () => {
    const after = movedCorner(tiny(), 'left', 1, [12, 3])

    expect(placeIn(after, 'left').corners).toEqual([
      [0, 0],
      [12, 3],
      [10, 10],
      [0, 10],
    ])
    expect(placeIn(after, 'right').corners).toEqual(
      placeIn(tiny(), 'right').corners,
    )
  })

  it('puts a new corner in after the one chosen', () => {
    const after = insertedCorner(tiny(), 'left', 0, [5, -2])

    expect(placeIn(after, 'left').corners[1]).toEqual([5, -2])
    expect(placeIn(after, 'left').corners).toHaveLength(5)
  })

  it('takes a corner out', () => {
    const five = insertedCorner(tiny(), 'left', 0, [5, -2])

    expect(placeIn(removedCorner(five, 'left', 1), 'left').corners).toHaveLength(4)
  })

  it('refuses to go below three corners', () => {
    // Two corners are a line, and a line has no inside. The place could
    // not be clicked, filled or checked for overlap.
    const three = removedCorner(tiny(), 'left', 0)

    expect(placeIn(three, 'left').corners).toHaveLength(3)
    expect(placeIn(removedCorner(three, 'left', 0), 'left').corners).toHaveLength(3)
  })

  it('moves where the count is drawn', () => {
    expect(placeIn(movedLabel(tiny(), 'left', [3, 8]), 'left').labelAt).toEqual([
      3, 8,
    ])
  })
})

describe('changing what a place is', () => {
  it('changes a name', () => {
    expect(placeIn(changedPlace(tiny(), 'left', { name: 'West' }), 'left').name).toBe(
      'West',
    )
  })

  it('records being an island only when it is one', () => {
    const island = changedPlace(tiny(), 'left', { isIsland: true })
    const back = changedPlace(island, 'left', { isIsland: false })

    expect(placeIn(island, 'left').isIsland).toBe(true)
    expect('isIsland' in placeIn(back, 'left')).toBe(false)
  })

  it('records being drawn over another place only when it is', () => {
    const city = changedPlace(tiny(), 'left', { drawnOver: 'right' })
    const back = changedPlace(city, 'left', { drawnOver: '' })

    expect(placeIn(city, 'left').drawnOver).toBe('right')
    expect('drawnOver' in placeIn(back, 'left')).toBe(false)
  })
})

describe('adding and taking away', () => {
  it('adds a place', () => {
    const after = addedPlace(tiny(), {
      id: 'top',
      name: 'Top',
      shortName: 'T',
      region: 'r1',
      borders: [],
      corners: squareAt([50, 50], 10),
      labelAt: [50, 50],
    })

    expect(after.places).toHaveLength(3)
    expect(placeIn(after, 'top').corners).toHaveLength(4)
  })

  it('takes every mention of a deleted place away with it', () => {
    // A border left pointing at a place that is gone would be reported as a
    // fault somewhere else entirely from the thing that caused it.
    const city = changedPlace(tiny(), 'right', { drawnOver: 'left' })
    const after = removedPlace(city, 'left')

    expect(after.places).toHaveLength(1)
    expect(placeIn(after, 'right').borders).toEqual([])
    expect('drawnOver' in placeIn(after, 'right')).toBe(false)
  })

  it('changes a region', () => {
    const after = changedRegion(tiny(), 'r1', { bonus: 7, name: 'Big' })

    expect(after.regions[0]?.bonus).toBe(7)
    expect(after.regions[0]?.name).toBe('Big')
  })

  it('refuses to remove a region places are still in', () => {
    expect(removedRegion(tiny(), 'r1').regions).toHaveLength(2)
  })

  it('removes a region nothing is in', () => {
    expect(removedRegion(tiny(), 'r2').regions).toHaveLength(1)
  })

  it('refuses to remove the last region', () => {
    const one: MapDraft = { ...tiny(), regions: [tiny().regions[0]!] }

    expect(removedRegion(one, 'r2').regions).toHaveLength(1)
  })
})

describe('making up an id', () => {
  it('builds one from the name', () => {
    expect(freeId([], 'The Far North')).toBe('theFarNorth')
  })

  it('never gives out one already taken', () => {
    expect(freeId(['theFarNorth'], 'The Far North')).toBe('theFarNorth2')
    expect(freeId(['theFarNorth', 'theFarNorth2'], 'The Far North')).toBe(
      'theFarNorth3',
    )
  })

  it('still gives an id when the name is no help', () => {
    expect(freeId([], '!!!')).toBe('place')
  })
})

describe('working borders out from the shapes', () => {
  it('finds a border two places share and adds it to both', () => {
    const apart: MapDraft = {
      ...tiny(),
      places: tiny().places.map((place) => ({ ...place, borders: [] })),
    }

    const { draft, added } = bordersFromShapes(apart)

    expect(added).toBe(2)
    expect(placeIn(draft, 'left').borders).toEqual(['right'])
    expect(placeIn(draft, 'right').borders).toEqual(['left'])
  })

  it('adds the missing half of a border typed on one side only', () => {
    // The mistake people make most, which is why it has its own rule.
    const half: MapDraft = {
      ...tiny(),
      places: tiny().places.map((place) =>
        place.id === 'right' ? { ...place, borders: [] } : place,
      ),
    }

    expect(bordersFromShapes(half).added).toBe(1)
  })

  it('changes nothing when every border is already there', () => {
    expect(bordersFromShapes(tiny()).added).toBe(0)
  })

  it('never takes a sea crossing away', () => {
    // Melbourne to Launceston crosses Bass Strait. No shape can tell you
    // that, so a border with no shared edge is not a mistake.
    const withSea = changedPlace(
      addedPlace(tiny(), {
        id: 'island',
        name: 'Island',
        shortName: 'I',
        region: 'r2',
        borders: ['left'],
        corners: squareAt([60, 60], 10),
        labelAt: [60, 60],
        isIsland: true,
      }),
      'left',
      { borders: ['right', 'island'] },
    )

    const { draft } = bordersFromShapes(withSea)

    expect(placeIn(draft, 'left').borders).toContain('island')
    expect(placeIn(draft, 'island').borders).toEqual(['left'])
  })

  it('finds the one border the real map draws but does not name', () => {
    // Run against the map we ship, this adds exactly one border, both ways
    // round. Eyre Peninsula and The Riverland share 28 units of edge at
    // x=543, and neither names the other, so the picture says you can walk
    // across and the rules say you cannot. Found by writing this. It is a
    // question for Nick, not a bug to fix quietly, because adding it opens
    // a new route across South Australia.
    const { draft, added } = bordersFromShapes(toDraft(AUSTRALIA_BIG))
    const eyre = draft.places.find((place) => place.id === 'eyre')

    expect(added).toBe(2)
    expect(eyre?.borders).toContain('riverland')
  })

  it('rebuilds a land border of the real map from nothing', () => {
    const stripped: MapDraft = {
      ...toDraft(AUSTRALIA_BIG),
      places: toDraft(AUSTRALIA_BIG).places.map((place) => ({
        ...place,
        borders: [],
      })),
    }

    const { draft } = bordersFromShapes(stripped)
    const find = (id: string) => draft.places.find((place) => place.id === id)

    // The Kimberley and The Pilbara share a long edge, so it finds them.
    expect(find('kimberley')?.borders).toContain('pilbara')

    // Melbourne to Launceston crosses Bass Strait. Nothing in the shapes
    // says so, and nothing here invents it.
    expect(find('melbourne')?.borders ?? []).not.toContain('launceston')
  })
})

describe('a draft still makes a real map', () => {
  it('survives every kind of change and still passes the rules', () => {
    let draft = toDraft(AUSTRALIA_BIG)

    draft = changedPlace(draft, 'perth', { name: 'Perth City' })
    draft = changedRegion(draft, 'tas', { bonus: 4 })
    draft = movedLabel(draft, 'hobart', [714, 692])

    expect(validateMap(fromDraft(draft))).toEqual([])
  })
})
