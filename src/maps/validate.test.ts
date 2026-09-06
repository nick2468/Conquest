import { describe, expect, it } from 'vitest'

import type { GameMap, TerritoryDefinition } from '../engine'
import { AUSTRALIA } from './australia'
import { assertValidMap, validateMap } from './validate'

/** A small good map, used as the starting point for every broken one below. */
function twoTerritoryMap(): GameMap {
  return {
    id: 'test',
    name: 'Test map',
    viewBox: '0 0 100 100',
    regions: [{ id: 'r1', name: 'Region one', bonus: 1, outline: '#000000' }],
    territories: [
      {
        id: 'a',
        name: 'A',
        shortName: 'A',
        regionId: 'r1',
        borders: ['b'],
        shape: 'M 0 0 L 10 0 L 10 10 Z',
        labelAt: { x: 5, y: 5 },
      },
      {
        id: 'b',
        name: 'B',
        shortName: 'B',
        regionId: 'r1',
        borders: ['a'],
        shape: 'M 20 0 L 30 0 L 30 10 Z',
        labelAt: { x: 25, y: 5 },
      },
    ],
  }
}

/** Change one territory in a copy of the good map. */
function withTerritory(
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

function rulesBroken(map: GameMap): string[] {
  return validateMap(map).map((problem) => problem.rule)
}

describe('a good map passes', () => {
  it('finds nothing wrong with the small test map', () => {
    expect(validateMap(twoTerritoryMap())).toEqual([])
  })
})

describe('each check catches its own mistake', () => {
  // A check that never fires is not a check. Each of the eight rules gets a
  // map that breaks it, and only it.

  it('1. catches two territories with the same id', () => {
    const map = twoTerritoryMap()
    const broken: GameMap = {
      ...map,
      territories: [...map.territories, map.territories[0] as never],
    }

    expect(rulesBroken(broken)).toContain('unique territory ids')
  })

  it('2. catches two regions with the same id', () => {
    const map = twoTerritoryMap()
    const broken: GameMap = {
      ...map,
      regions: [...map.regions, map.regions[0] as never],
    }

    expect(rulesBroken(broken)).toContain('unique region ids')
  })

  it('3. catches a territory in a region that does not exist', () => {
    const broken = withTerritory(twoTerritoryMap(), 'a', {
      regionId: 'nowhere',
    })

    expect(rulesBroken(broken)).toContain('region exists')
  })

  it('4. catches a border to a territory that does not exist', () => {
    const broken = withTerritory(twoTerritoryMap(), 'a', {
      borders: ['b', 'atlantis'],
    })

    expect(rulesBroken(broken)).toContain('border exists')
  })

  it('5. catches a territory that borders itself', () => {
    const broken = withTerritory(twoTerritoryMap(), 'a', {
      borders: ['a', 'b'],
    })

    expect(rulesBroken(broken)).toContain('no self border')
  })

  // The mistake this catches is the most common one by far.
  it('6. catches a border typed on one side only', () => {
    const broken = withTerritory(twoTerritoryMap(), 'b', { borders: [] })

    expect(rulesBroken(broken)).toContain('borders are symmetric')
  })

  it('7. catches a region holding no territories', () => {
    const map = twoTerritoryMap()
    const broken: GameMap = {
      ...map,
      regions: [
        ...map.regions,
        { id: 'empty', name: 'Empty', bonus: 1, outline: '#000000' },
      ],
    }

    expect(rulesBroken(broken)).toContain('region has territories')
  })

  it('8. catches a territory nobody can reach', () => {
    const map = twoTerritoryMap()
    const broken: GameMap = {
      ...map,
      territories: [
        ...map.territories,
        {
          id: 'island',
          name: 'Island',
          shortName: 'IS',
          regionId: 'r1',
          borders: [],
          shape: 'M 50 50 L 60 50 L 60 60 Z',
          labelAt: { x: 55, y: 55 },
        },
      ],
    }

    expect(rulesBroken(broken)).toContain('map is connected')
  })
})

describe('the messages help the person who made the mistake', () => {
  it('names both territories when a border is one-sided', () => {
    const broken = withTerritory(twoTerritoryMap(), 'b', { borders: [] })
    const message = validateMap(broken)[0]?.message ?? ''

    expect(message).toContain('"a"')
    expect(message).toContain('"b"')
    expect(message).toContain('Add it to both')
  })

  it('lists every stranded territory', () => {
    const map = twoTerritoryMap()
    const broken: GameMap = {
      ...map,
      territories: map.territories.map((territory) => ({
        ...territory,
        borders: [],
      })),
    }

    expect(validateMap(broken).at(-1)?.message).toContain('b')
  })
})

describe('assertValidMap', () => {
  it('says nothing about a good map', () => {
    expect(() => assertValidMap(twoTerritoryMap())).not.toThrow()
  })

  it('throws and lists every problem at once', () => {
    const broken = withTerritory(twoTerritoryMap(), 'a', {
      regionId: 'nowhere',
      borders: ['a', 'atlantis'],
    })

    expect(() => assertValidMap(broken)).toThrow(/problem\(s\)/)
  })
})

describe('the Australia map', () => {
  it('passes every check', () => {
    expect(validateMap(AUSTRALIA)).toEqual([])
  })

  it('has ten territories in four regions', () => {
    expect(AUSTRALIA.territories).toHaveLength(10)
    expect(AUSTRALIA.regions).toHaveLength(4)
  })

  it('gives every territory a shape and a label position', () => {
    for (const territory of AUSTRALIA.territories) {
      expect(territory.shape.startsWith('M ')).toBe(true)
      expect(territory.shape.trimEnd().endsWith('Z')).toBe(true)
      expect(territory.labelAt.x).toBeGreaterThan(0)
      expect(territory.labelAt.y).toBeGreaterThan(0)
    }
  })

  it('keeps every shape and label inside the viewBox', () => {
    const [, , width, height] = AUSTRALIA.viewBox.split(' ').map(Number)

    for (const territory of AUSTRALIA.territories) {
      expect(territory.labelAt.x).toBeLessThan(width as number)
      expect(territory.labelAt.y).toBeLessThan(height as number)

      const numbers = territory.shape.match(/[\d.]+/g) ?? []

      for (const pair of chunkIntoPairs(numbers.map(Number))) {
        expect(pair[0]).toBeLessThanOrEqual(width as number)
        expect(pair[1]).toBeLessThanOrEqual(height as number)
      }
    }
  })

  // The two territories the spec calls out as interesting. If either changes,
  // the map plays differently and somebody should have meant it.
  it('leaves the Australian Capital Territory with one way out', () => {
    const act = AUSTRALIA.territories.find((each) => each.id === 'act')

    expect(act?.borders).toEqual(['nsw'])
  })

  it('leaves South Australia bordering five others', () => {
    const sa = AUSTRALIA.territories.find((each) => each.id === 'sa')

    expect(sa?.borders).toHaveLength(5)
  })
})

function chunkIntoPairs(values: readonly number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []

  for (let index = 0; index + 1 < values.length; index += 2) {
    pairs.push([values[index] as number, values[index + 1] as number])
  }

  return pairs
}
