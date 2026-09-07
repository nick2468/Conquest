import { describe, expect, it } from 'vitest'

import type { GameMap } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import { WORLD } from '../maps/world'
import { BUILT_IN, labelFor, mapCalled, mapChoices } from './map-library'

/**
 * Plan task 5.7, the part that can be tested without a browser.
 *
 * Reading and remembering a file needs one. Choosing which map to offer,
 * and what to call it, does not.
 */

/** A map of your own, near enough for these. */
function myOwn(id: string, name: string): GameMap {
  return { ...AUSTRALIA, id, name }
}

describe('which maps a player may pick', () => {
  it('offers every built-in map when nothing has been loaded', () => {
    expect(mapChoices(null)).toHaveLength(3)
    expect(mapChoices(null).every((choice) => !choice.fromFile)).toBe(true)
  })

  it('offers the world first, because it is the one most people come for', () => {
    expect(BUILT_IN[0]).toBe(WORLD)
    expect(BUILT_IN[1]).toBe(AUSTRALIA_BIG)
  })

  it('adds a loaded map at the end', () => {
    const choices = mapChoices(myOwn('mine', 'The Moon'))

    expect(choices).toHaveLength(4)
    expect(choices[3]?.map.name).toBe('The Moon')
    expect(choices[3]?.fromFile).toBe(true)
  })

  it('replaces a built-in map when a loaded one shares its id', () => {
    // Two maps with one id would put the same name in the list twice, and
    // the game would have no way to tell which one was meant.
    const choices = mapChoices(myOwn('australia', 'Australia, my way'))

    expect(choices).toHaveLength(3)
    expect(choices.map((choice) => choice.map.id)).toEqual([
      'world',
      'australia-big',
      'australia',
    ])
    expect(choices[2]?.map.name).toBe('Australia, my way')
    expect(choices[2]?.fromFile).toBe(true)
  })
})

describe('what a map is called in the list', () => {
  it('says the name and how many places it has', () => {
    expect(labelFor({ map: AUSTRALIA, fromFile: false })).toBe(
      'Australia, 10 places',
    )
  })

  it('says when a map is the player own', () => {
    expect(labelFor({ map: myOwn('mine', 'The Moon'), fromFile: true })).toBe(
      'The Moon, 10 places, your own',
    )
  })
})

describe('finding the map that was picked', () => {
  it('finds a built-in map by its id', () => {
    expect(mapCalled('australia', null)).toBe(AUSTRALIA)
  })

  it('finds a loaded map by its id', () => {
    const mine = myOwn('mine', 'The Moon')

    expect(mapCalled('mine', mine)).toBe(mine)
  })

  it('falls back to the first map rather than to nothing', () => {
    // A missing map would leave the new game screen with no board at all,
    // and the player with no way to fix it.
    expect(mapCalled('no such map', null)).toBe(WORLD)
  })

  it('falls back after a loaded map is forgotten', () => {
    expect(mapCalled('mine', null)).toBe(WORLD)
  })
})
