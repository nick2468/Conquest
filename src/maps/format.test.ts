import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from './australia'
import { AUSTRALIA_BIG } from './australia-big'
import { MAP_FORMAT, readMap, writeMap } from './format'

/**
 * Plan tasks 5.5 and 5.6.
 *
 * The round trip is the important one. Writing the maps we ship out to a
 * file and reading them back gives two 38-place maps to compare, which is a
 * far harder test than any map written by hand for a test would be.
 *
 * The rest feed it broken files. A person who wrote the map is the one
 * reading the complaint, so every message has to say what to do, and a test
 * that only checked "it failed" would let a useless message through.
 */

function badFile(text: string): string[] {
  const read = readMap(text)

  expect(read.map).toBeUndefined()
  return (read.problems ?? []).map((problem) => problem.message)
}

/** A good small map, used as the starting point for every broken one. */
function goodFile(changes: Record<string, unknown> = {}): string {
  return JSON.stringify({
    conquestMap: MAP_FORMAT,
    id: 'tiny',
    name: 'Tiny',
    viewBox: '0 0 100 100',
    regions: [{ id: 'r1', name: 'Region one', bonus: 2, outline: '#b8763a' }],
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
    ...changes,
  })
}

describe('a map survives being written out and read back', () => {
  for (const map of [AUSTRALIA, AUSTRALIA_BIG]) {
    it(`keeps every part of ${map.name}`, () => {
      const read = readMap(writeMap(map))

      expect(read.problems).toBeUndefined()
      expect(read.map).toEqual(map)
    })
  }

  it('keeps the shapes exactly, not nearly', () => {
    // A corner that moved by a hundredth would put two places a hundredth
    // apart, which is the fault the corner list exists to prevent.
    const read = readMap(writeMap(AUSTRALIA_BIG))
    const before = AUSTRALIA_BIG.territories.map((each) => each.shape)
    const after = (read.map?.territories ?? []).map((each) => each.shape)

    expect(after).toEqual(before)
  })

  it('keeps which places are islands and which are drawn over others', () => {
    const read = readMap(writeMap(AUSTRALIA_BIG))
    const islands = (read.map?.territories ?? [])
      .filter((each) => each.isIsland === true)
      .map((each) => each.id)
    const cities = (read.map?.territories ?? [])
      .filter((each) => each.drawnOver !== undefined)
      .map((each) => each.id)

    expect(islands).toHaveLength(5)
    expect(cities).toHaveLength(6)
  })

  it('writes a file a person can read', () => {
    const written = writeMap(AUSTRALIA)

    // Laid out over many lines, not one long one.
    expect(written.split('\n').length).toBeGreaterThan(50)
    expect(written).toContain('"conquestMap": 1')
    expect(written).toContain('"Rottnest Island"')
  })
})

describe('a good file loads', () => {
  it('reads a small map written by hand', () => {
    const read = readMap(goodFile())

    expect(read.problems).toBeUndefined()
    expect(read.map?.territories).toHaveLength(2)
    expect(read.map?.territories[0]?.shape).toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z')
  })
})

describe('a file that is not a map at all', () => {
  it('says so when it is not JSON', () => {
    expect(badFile('hello, this is not a map').join(' ')).toContain(
      'written in JSON',
    )
  })

  it('says so when it is a list rather than a map', () => {
    expect(badFile('[1, 2, 3]').join(' ')).toContain('holds one map')
  })

  it('says so when it never claims to be a Conquest map', () => {
    expect(badFile('{"name": "Something else"}').join(' ')).toContain(
      '"conquestMap": 1',
    )
  })

  it('says so when it is written in a format we do not read', () => {
    expect(badFile('{"conquestMap": 99}').join(' ')).toContain('format 99')
  })

  it('refuses a file far too big to be a map', () => {
    expect(badFile(`{"conquestMap":1,"x":"${'a'.repeat(2_000_001)}"}`).join(' ')).toContain(
      'nowhere near',
    )
  })
})

describe('a map file with something missing', () => {
  it('names the region with no name', () => {
    const said = badFile(
      goodFile({
        regions: [{ id: 'r1', bonus: 2, outline: '#b8763a' }],
      }),
    ).join(' ')

    expect(said).toContain('Region 1')
    expect(said).toContain('no name')
  })

  it('names the place with too few corners', () => {
    const broken = JSON.parse(goodFile()) as Record<string, unknown>
    const places = broken['places'] as Array<Record<string, unknown>>
    places[0] = { ...places[0], corners: [[0, 0]] }

    expect(badFile(JSON.stringify(broken)).join(' ')).toContain(
      'at least three corners',
    )
  })

  it('says what a colour should look like', () => {
    const said = badFile(
      goodFile({
        regions: [{ id: 'r1', name: 'One', bonus: 2, outline: 'orange' }],
      }),
    ).join(' ')

    expect(said).toContain('#b8763a')
  })

  it('says what a viewBox should look like', () => {
    expect(badFile(goodFile({ viewBox: 'the whole world' })).join(' ')).toContain(
      '0 0 800 600',
    )
  })

  it('says when there are no places at all', () => {
    expect(badFile(goodFile({ places: [] })).join(' ')).toContain('has none')
  })
})

describe('a map file that breaks the rules of a map', () => {
  it('reports a border named on one side only, in plain words', () => {
    const broken = JSON.parse(goodFile()) as Record<string, unknown>
    const places = broken['places'] as Array<Record<string, unknown>>
    places[1] = { ...places[1], borders: [] }

    expect(badFile(JSON.stringify(broken)).join(' ')).toContain('Add it to both')
  })

  it('reports a cosmetic fault AND a rule fault together', () => {
    // A person writing a map wants to see everything that is wrong with
    // it, not one thing per attempt. The colour is nonsense AND the two
    // places overlap AND one border is named on one side only.
    const broken = JSON.parse(
      goodFile({
        regions: [{ id: 'r1', name: 'One', bonus: 2, outline: 'green' }],
      }),
    ) as Record<string, unknown>
    const places = broken['places'] as Array<Record<string, unknown>>
    places[1] = {
      ...places[1],
      borders: [],
      corners: [
        [5, 0],
        [20, 0],
        [20, 10],
        [5, 10],
      ],
      labelAt: [18, 5],
    }

    const said = badFile(JSON.stringify(broken)).join(' ')

    expect(said).toContain('#b8763a')
    expect(said).toContain('Add it to both')
    expect(said).toContain('may only share a border')
  })

  it('holds the rule check back when part of the file could not be read', () => {
    // A place with no corners is thrown away. Checking the rules against a
    // map with a hole in it would invent faults that are not in the file.
    const broken = JSON.parse(goodFile()) as Record<string, unknown>
    const places = broken['places'] as Array<Record<string, unknown>>
    places[1] = { ...places[1], corners: [] }

    const said = badFile(JSON.stringify(broken)).join(' ')

    expect(said).toContain('at least three corners')
    expect(said).toContain('have not been checked yet')
    expect(said).not.toContain('cannot be reached')
  })

  it('reports two places covering the same ground', () => {
    const broken = JSON.parse(goodFile()) as Record<string, unknown>
    const places = broken['places'] as Array<Record<string, unknown>>
    places[1] = {
      ...places[1],
      corners: [
        [5, 0],
        [20, 0],
        [20, 10],
        [5, 10],
      ],
      labelAt: [18, 5],
    }

    expect(badFile(JSON.stringify(broken)).join(' ')).toContain(
      'may only share a border',
    )
  })
})
