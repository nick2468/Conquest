import { describe, expect, it } from 'vitest'

import { touchingLength } from './shapes'
import type { Corner } from './shapes'

/**
 * How much of two shapes' outlines run along each other. Plan task 5.12.
 *
 * This is what separates a LAND border from a sea crossing: two places that
 * share a coastline touch, two places that face each other across water do
 * not. The map editor uses it to decide whether a border may be drawn, and
 * the board uses it to decide whether to draw a dashed sea route.
 *
 * The fault these tests were written for: the answer depended on which
 * shape was asked about first. A small place lying along the side of a big
 * one read as not touching at all, so the board drew a sea route across dry
 * land. See the first block below.
 */

/** A rectangle, corner by corner. */
function box(left: number, top: number, right: number, bottom: number): Corner[] {
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

describe('two shapes that share a coast are touching, whichever is asked first', () => {
  // A long country, and a small one sitting against the middle of its side.
  const big = box(0, 0, 100, 40)
  const small = box(40, 40, 60, 55)

  it('finds the shared coast', () => {
    expect(touchingLength(big, small)).toBeCloseTo(20, 6)
  })

  it('gives the SAME answer the other way round', () => {
    // The bug. The small place's edge lies along the big one's, but the big
    // one's edge runs far past both ends of the small one's, so asking in
    // that order used to answer zero and the two looked like islands.
    expect(touchingLength(small, big)).toBeCloseTo(20, 6)
  })

  it('answers the same for every pairing, however lopsided', () => {
    for (const width of [1, 3, 10, 50, 99]) {
      const strip = box(0, 40, width, 55)

      expect(touchingLength(strip, big)).toBeCloseTo(
        touchingLength(big, strip),
        6,
      )
      expect(touchingLength(strip, big)).toBeCloseTo(width, 6)
    }
  })
})

describe('two coasts that only PARTLY overlap still share that part', () => {
  it('finds the overlap when neither edge contains the other', () => {
    // Along the line y = 40: one runs 0 to 100, the other 50 to 150. Each
    // has one end on the other and one end past it, so neither contains
    // the other. They share 50.
    const west = box(0, 0, 100, 40)
    const east = [
      [50, 40],
      [150, 40],
      [150, 80],
      [50, 80],
    ] as Corner[]

    expect(touchingLength(west, east)).toBeCloseTo(50, 6)
    expect(touchingLength(east, west)).toBeCloseTo(50, 6)
  })

  it('finds nothing where collinear edges do not overlap at all', () => {
    const west = box(0, 0, 40, 40)
    const east = [
      [60, 40],
      [100, 40],
      [100, 80],
      [60, 80],
    ] as Corner[]

    expect(touchingLength(west, east)).toBeCloseTo(0, 6)
    expect(touchingLength(east, west)).toBeCloseTo(0, 6)
  })
})

describe('shapes that do not share a coast are not touching', () => {
  it('says nothing about two boxes with water between them', () => {
    expect(touchingLength(box(0, 0, 40, 40), box(0, 60, 40, 90))).toBe(0)
    expect(touchingLength(box(0, 60, 40, 90), box(0, 0, 40, 40))).toBe(0)
  })

  it('says nothing about two boxes that meet at one corner only', () => {
    // A single point has no length, so it is not a border.
    expect(touchingLength(box(0, 0, 40, 40), box(40, 40, 80, 80))).toBeCloseTo(
      0,
      6,
    )
  })

  it('is not fooled by a shape sitting inside another', () => {
    const outer = box(0, 0, 100, 100)
    const inner = box(40, 40, 60, 60)

    expect(touchingLength(outer, inner)).toBe(touchingLength(inner, outer))
  })
})

describe('the answer is the LONGEST shared run, not the first found', () => {
  it('prefers a long coast over a short one', () => {
    const land = box(0, 0, 100, 40)
    // Touches along 30 at the bottom, and nothing else.
    const neighbour = box(10, 40, 40, 70)

    expect(touchingLength(land, neighbour)).toBeCloseTo(30, 6)
    expect(touchingLength(neighbour, land)).toBeCloseTo(30, 6)
  })
})
