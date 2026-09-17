import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../engine'
import type { SetupStore } from './remembered-setup'
import { recallSetup, rememberSetup } from './remembered-setup'

/** A stand-in for the browser's storage. */
function aStore(): SetupStore & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>()

  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value)
    },
  }
}

describe('the new game screen is remembered', () => {
  // Plan task 4.21. Nick: "Can option selections be persisted?"
  it('gives back exactly what was kept', () => {
    const store = aStore()
    const setup = {
      players: [
        { name: 'James', kind: 'human' as const, colour: '#2f6fb0' },
        { name: 'General', kind: 'general' as const, colour: '#c8453b' },
      ],
      options: { ...DEFAULT_OPTIONS, cardTrading: 'anyTime' as const, fortifyDistance: 'adjacent' as const },
      mapId: 'australia-big',
    }

    rememberSetup(setup, store)

    expect(recallSetup(store)).toEqual(setup)
  })

  it('gives back nothing when nothing was kept', () => {
    expect(recallSetup(aStore())).toBeNull()
  })

  it('ignores something that is not a setup at all', () => {
    const store = aStore()

    store.setItem('conquest.setup', '{not json')
    expect(recallSetup(store)).toBeNull()

    store.setItem('conquest.setup', JSON.stringify({ players: 'three' }))
    expect(recallSetup(store)).toBeNull()
  })

  it('refuses a player kind the game does not know', () => {
    const store = aStore()

    store.setItem(
      'conquest.setup',
      JSON.stringify({
        players: [
          { name: 'A', kind: 'human' },
          { name: 'B', kind: 'wizard' },
        ],
        options: {},
        mapId: 'world',
      }),
    )

    expect(recallSetup(store)).toBeNull()
  })

  it('replaces an option it does not recognise with the default', () => {
    const store = aStore()

    store.setItem(
      'conquest.setup',
      JSON.stringify({
        players: [
          { name: 'A', kind: 'human' },
          { name: 'B', kind: 'greedy' },
        ],
        options: { cardSetValue: 'sometimes', diceDisplay: 'oneByOne' },
        mapId: 'world',
      }),
    )

    const recalled = recallSetup(store)

    expect(recalled?.options.cardSetValue).toBe(DEFAULT_OPTIONS.cardSetValue)
    expect(recalled?.options.diceDisplay).toBe('oneByOne')
    expect(recalled?.options.cardTrading).toBe('classic')
  })

  it('keeps the fortify moves and the ceiling, and refuses a ceiling it does not offer', () => {
    const store = aStore()
    const players = [
      { name: 'A', kind: 'human' },
      { name: 'B', kind: 'turtle' },
    ]

    store.setItem(
      'conquest.setup',
      JSON.stringify({ players, options: { fortifyMoves: 'many', risingSetCap: 40 }, mapId: 'world' }),
    )
    expect(recallSetup(store)?.options.fortifyMoves).toBe('many')
    expect(recallSetup(store)?.options.risingSetCap).toBe(40)

    store.setItem(
      'conquest.setup',
      JSON.stringify({ players, options: { risingSetCap: 1000 }, mapId: 'world' }),
    )
    expect(recallSetup(store)?.options.risingSetCap).toBe(DEFAULT_OPTIONS.risingSetCap)
  })

  it('keeps the territory card bonus turned off, and turns it on for an older setup', () => {
    const store = aStore()
    const players = [
      { name: 'A', kind: 'human' },
      { name: 'B', kind: 'turtle' },
    ]

    // Turned off, and remembered as off. This was being forgotten.
    store.setItem(
      'conquest.setup',
      JSON.stringify({ players, options: { territoryCardBonus: false }, mapId: 'world' }),
    )
    expect(recallSetup(store)?.options.territoryCardBonus).toBe(false)

    // Saved before the rule existed: gets the default, which is on.
    store.setItem(
      'conquest.setup',
      JSON.stringify({ players, options: { fortifyMoves: 'many' }, mapId: 'world' }),
    )
    expect(recallSetup(store)?.options.territoryCardBonus).toBe(true)

    // Anything that is not yes or no is ignored.
    store.setItem(
      'conquest.setup',
      JSON.stringify({ players, options: { territoryCardBonus: 'no' }, mapId: 'world' }),
    )
    expect(recallSetup(store)?.options.territoryCardBonus).toBe(true)
  })
})
