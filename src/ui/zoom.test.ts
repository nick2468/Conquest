import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import {
  magnification,
  middleOf,
  placesInView,
  viewBoxFor,
  widthOnScreen,
} from './zoom'

function box(viewBox: string) {
  const [left, top, width, height] = viewBox.split(' ').map(Number) as [
    number, number, number, number,
  ]

  return { left, top, width, height, right: left + width, bottom: top + height }
}

describe('what to show when looking closely at a place', () => {
  it('shows the place and everywhere it borders', () => {
    const shown = placesInView(AUSTRALIA_BIG, 'perth').map((each) => each.id)

    expect(shown.sort()).toEqual(['perth', 'rottnest', 'southWest'])
  })

  // An attack always crosses a border, so a view of only the tapped place
  // would hide every target worth having.
  it('always includes somewhere to attack', () => {
    for (const place of AUSTRALIA_BIG.territories) {
      expect(placesInView(AUSTRALIA_BIG, place.id).length, place.name)
        .toBeGreaterThan(1)
    }
  })

  it('shows nothing at all for a place that does not exist', () => {
    expect(placesInView(AUSTRALIA_BIG, 'atlantis')).toEqual([])
  })
})

describe('the frame for a close view', () => {
  it('gives back the whole map when nothing is chosen', () => {
    expect(viewBoxFor(AUSTRALIA_BIG, null)).toBe(AUSTRALIA_BIG.viewBox)
  })

  it('keeps the shape of the map, so nothing is stretched', () => {
    const whole = box(AUSTRALIA_BIG.viewBox)

    for (const place of AUSTRALIA_BIG.territories) {
      const shown = box(viewBoxFor(AUSTRALIA_BIG, place.id))

      expect(shown.width / shown.height, place.name).toBeCloseTo(
        whole.width / whole.height,
        5,
      )
    }
  })

  it('never shows anything outside the map', () => {
    const whole = box(AUSTRALIA_BIG.viewBox)

    for (const place of AUSTRALIA_BIG.territories) {
      const shown = box(viewBoxFor(AUSTRALIA_BIG, place.id))

      expect(shown.left, place.name).toBeGreaterThanOrEqual(whole.left - 0.001)
      expect(shown.top, place.name).toBeGreaterThanOrEqual(whole.top - 0.001)
      expect(shown.right, place.name).toBeLessThanOrEqual(whole.right + 0.001)
      expect(shown.bottom, place.name).toBeLessThanOrEqual(whole.bottom + 0.001)
    }
  })

  it('never zooms out past the whole map', () => {
    for (const place of AUSTRALIA_BIG.territories) {
      expect(
        magnification(AUSTRALIA_BIG, place.id),
        place.name,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  /**
   * The test that says the close view is worth having.
   *
   * The point of it is that the small places stop being hard to hit. Perth
   * is a nineteen-unit square on a six-hundred-and-ninety-unit board: about
   * a thirtieth of the screen across, which on an iPad is a few
   * millimetres. In its own close view it has to be a real target.
   */
  it('makes every place a comfortable size to tap', () => {
    for (const place of AUSTRALIA_BIG.territories) {
      const close = viewBoxFor(AUSTRALIA_BIG, place.id)

      expect(
        widthOnScreen(place, close),
        `${place.name} is still only ${(
          widthOnScreen(place, close) * 100
        ).toFixed(1)}% of the screen wide`,
      ).toBeGreaterThan(0.06)
    }
  })

  it('helps most where it is needed most', () => {
    const perthClose = widthOnScreen(
      AUSTRALIA_BIG.territories.find((each) => each.id === 'perth') as never,
      viewBoxFor(AUSTRALIA_BIG, 'perth'),
    )
    const perthFar = widthOnScreen(
      AUSTRALIA_BIG.territories.find((each) => each.id === 'perth') as never,
      AUSTRALIA_BIG.viewBox,
    )

    expect(perthClose / perthFar).toBeGreaterThan(3)
  })

  // Zooming until three places fill the screen is not a close view of the
  // board, it is a different board. You stop knowing where you are.
  it('never goes closer than the map allows', () => {
    for (const place of AUSTRALIA_BIG.territories) {
      expect(magnification(AUSTRALIA_BIG, place.id), place.name)
        .toBeLessThanOrEqual(3.21)
    }
  })

  it('works on the small map too', () => {
    for (const place of AUSTRALIA.territories) {
      expect(
        magnification(AUSTRALIA, place.id),
        place.name,
      ).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('the middle of a shape', () => {
  it('is inside the box the shape fits in', () => {
    for (const place of AUSTRALIA_BIG.territories) {
      const middle = middleOf(place)
      const numbers = (place.shape.match(/[\d.]+/g) ?? []).map(Number)
      const xs = numbers.filter((_u, index) => index % 2 === 0)
      const ys = numbers.filter((_u, index) => index % 2 === 1)

      expect(middle.x, place.name).toBeGreaterThanOrEqual(Math.min(...xs))
      expect(middle.x).toBeLessThanOrEqual(Math.max(...xs))
      expect(middle.y).toBeGreaterThanOrEqual(Math.min(...ys))
      expect(middle.y).toBeLessThanOrEqual(Math.max(...ys))
    }
  })
})
