import { describe, expect, it } from 'vitest'

import { AUSTRALIA_BIG } from '../maps/australia-big'
import { cornersOf } from '../maps/shapes'
import { WORLD } from '../maps/world'
import { seaRouteLines, seaRoutesOf } from './sea-routes'

/** How many separate lines a path draws: one per "M". */
function linesIn(path: string): number {
  return (path.match(/M /g) ?? []).length
}

function lineBetween(one: string, two: string) {
  return seaRouteLines(WORLD).filter(
    ({ places }) => places.includes(one) && places.includes(two),
  )
}

/** The world place whose outline has this corner, or undefined. */
function placeWithCorner([x, y]: readonly [number, number]): string | undefined {
  return WORLD.territories.find((each) =>
    cornersOf(each.shape).some(([cx, cy]) => cx === x && cy === y),
  )?.id
}

describe('the sea routes drawn on the board', () => {
  // Plan task 4.20. 24 of the world's borders cross water, and every one
  // is a crossing on the printed board too. Scandinavia and Northern
  // Europe are not among them: in Nick's drawing they meet on land,
  // through Denmark.
  it('draws every crossing on the world map', () => {
    // 23 crossings as one line each, and Alaska to Kamchatka as two short
    // lines, one off each edge of the map.
    expect(linesIn(seaRoutesOf(WORLD))).toBe(25)
  })

  it('takes Alaska to Kamchatka off the edges, not straight across the world', () => {
    const [left = 0, , width = 0] = WORLD.viewBox.split(' ').map(Number)
    const lines = seaRoutesOf(WORLD).split(' M ')
    const offTheEdge = lines.filter(
      (line) => line.includes(` L ${left} `) || line.includes(` L ${left + width} `),
    )

    expect(offTheEdge).toHaveLength(2)
  })

  it('draws nothing between places that share a border on land', () => {
    const path = seaRoutesOf(AUSTRALIA_BIG)
    const crossings = AUSTRALIA_BIG.territories.filter((each) => each.isIsland === true)

    // Only islands are reached by sea on the Australia map, so there are
    // no more lines than there are ways onto an island.
    const waysOntoIslands = crossings.reduce((total, island) => total + island.borders.length, 0)

    expect(linesIn(path)).toBeLessThanOrEqual(waysOntoIslands)
  })
})

describe('where a sea route is drawn', () => {
  // Plan task 4.22. Nick: "Greenland looks like it is going twice to NWT and
  // not to Ontario", "EAF to Middle East bit hard to see", and "Alaska seems
  // to be drawing to the inland junction of YAK, IRK and Kamchatka".

  it('starts and ends each line on the two places it joins, and nowhere else', () => {
    for (const { from, to, places } of seaRouteLines(WORLD)) {
      const [left = 0, , width = 0] = WORLD.viewBox.split(' ').map(Number)
      const ends = [from, to].filter(([x]) => x !== left && x !== left + width)

      for (const end of ends) {
        expect(places).toContain(placeWithCorner(end))
      }
    }
  })

  it('draws a Greenland line to Ontario as well as to the Northwest Territory', () => {
    expect(lineBetween('greenland', 'ontario')).toHaveLength(1)
    expect(lineBetween('greenland', 'northwestTerritory')).toHaveLength(1)
  })

  it('draws a short strait long enough to see', () => {
    const [line] = lineBetween('eastAfrica', 'middleEast')

    expect(line).toBeDefined()
    if (line === undefined) return
    expect(Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1])).toBeGreaterThan(12)
  })

  it('takes Kamchatka off the map from its far eastern coast', () => {
    const kamchatka = WORLD.territories.find((each) => each.id === 'kamchatka')
    const eastmost = Math.max(...cornersOf(kamchatka?.shape ?? '').map(([x]) => x))
    const stub = lineBetween('alaska', 'kamchatka').find(
      ({ from }) => placeWithCorner(from) === 'kamchatka',
    )

    expect(stub).toBeDefined()
    // Within a small margin of the easternmost point: a coast corner, not
    // the inland corner where Kamchatka meets Yakutsk and Irkutsk.
    expect(eastmost - (stub?.from[0] ?? 0)).toBeLessThan(15)
  })
})
