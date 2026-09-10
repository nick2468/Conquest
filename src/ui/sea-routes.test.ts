import { describe, expect, it } from 'vitest'

import { AUSTRALIA_BIG } from '../maps/australia-big'
import { WORLD } from '../maps/world'
import { seaRoutesOf } from './sea-routes'

/** How many separate lines a path draws: one per "M". */
function linesIn(path: string): number {
  return (path.match(/M /g) ?? []).length
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
