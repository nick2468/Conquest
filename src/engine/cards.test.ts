import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { RISING_SET_CAP,
  RISING_SET_VALUES, WILD_CARDS } from './balance'
import type { CardTrio } from './cards'
import {
  createDeck,
  isSet,
  mustTradeASet,
  risingValueOf,
  setValue,
  setsInHand,
} from './cards'
import { seededRandom } from './random'
import { DEFAULT_OPTIONS } from './setup'
import type { Card, CardSymbol, GameOptions } from './types'

let nextCardNumber = 0

function card(symbol: CardSymbol): Card {
  nextCardNumber += 1

  return {
    id: `c${nextCardNumber}`,
    symbol,
    territoryId: symbol === 'wild' ? null : 'wa',
  }
}

function trio(a: CardSymbol, b: CardSymbol, c: CardSymbol): CardTrio {
  return [card(a), card(b), card(c)]
}

const FIXED: GameOptions = { ...DEFAULT_OPTIONS, cardSetValue: 'fixed' }
const RISING: GameOptions = { ...DEFAULT_OPTIONS, cardSetValue: 'rising' }

describe('building a deck', () => {
  it('makes one card per territory plus the wild cards', () => {
    const deck = createDeck(AUSTRALIA, seededRandom(1))

    expect(deck.undrawn).toHaveLength(
      AUSTRALIA.territories.length + WILD_CARDS,
    )
  })

  it('gives every card a different id', () => {
    const deck = createDeck(AUSTRALIA, seededRandom(1))
    const ids = deck.undrawn.map((each) => each.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spreads the three symbols evenly over the territories', () => {
    const deck = createDeck(AUSTRALIA, seededRandom(1))
    const counts = new Map<CardSymbol, number>()

    for (const each of deck.undrawn) {
      counts.set(each.symbol, (counts.get(each.symbol) ?? 0) + 1)
    }

    // 10 territories over 3 symbols is 4, 3, 3.
    const ordinary = [
      counts.get('infantry') ?? 0,
      counts.get('cavalry') ?? 0,
      counts.get('artillery') ?? 0,
    ]

    expect(Math.max(...ordinary) - Math.min(...ordinary)).toBeLessThanOrEqual(1)
    expect(counts.get('wild')).toBe(WILD_CARDS)
  })

  it('shuffles, so two seeds give two orders', () => {
    const first = createDeck(AUSTRALIA, seededRandom(1)).undrawn.map(
      (each) => each.id,
    )
    const second = createDeck(AUSTRALIA, seededRandom(2)).undrawn.map(
      (each) => each.id,
    )

    expect(first).not.toEqual(second)
  })
})

describe('what makes a set', () => {
  it('accepts three of the same symbol', () => {
    expect(isSet(trio('infantry', 'infantry', 'infantry'))).toBe(true)
  })

  it('accepts three different symbols', () => {
    expect(isSet(trio('infantry', 'cavalry', 'artillery'))).toBe(true)
  })

  it('refuses two the same and one different', () => {
    expect(isSet(trio('infantry', 'infantry', 'cavalry'))).toBe(false)
  })

  // Worth knowing: any three cards holding a wild are a set. Two the same
  // plus a wild are three of a kind. Two different plus a wild are three
  // different. There is no third case.
  it('accepts two the same and a wild', () => {
    expect(isSet(trio('infantry', 'infantry', 'wild'))).toBe(true)
  })

  it('accepts two different and a wild', () => {
    expect(isSet(trio('infantry', 'cavalry', 'wild'))).toBe(true)
  })

  it('accepts one card and two wilds', () => {
    expect(isSet(trio('cavalry', 'wild', 'wild'))).toBe(true)
  })
})

describe('what a set is worth, fixed', () => {
  it('pays 4 for three infantry', () => {
    expect(setValue(trio('infantry', 'infantry', 'infantry'), FIXED, 0)).toBe(4)
  })

  it('pays 6 for three cavalry', () => {
    expect(setValue(trio('cavalry', 'cavalry', 'cavalry'), FIXED, 0)).toBe(6)
  })

  it('pays 8 for three artillery', () => {
    expect(setValue(trio('artillery', 'artillery', 'artillery'), FIXED, 0)).toBe(
      8,
    )
  })

  it('pays 10 for three different', () => {
    expect(setValue(trio('infantry', 'cavalry', 'artillery'), FIXED, 0)).toBe(10)
  })

  it('ignores how many sets went before', () => {
    expect(setValue(trio('cavalry', 'cavalry', 'cavalry'), FIXED, 99)).toBe(6)
  })

  it('reads a wild the way that pays most', () => {
    // Two infantry and a wild can only be three infantry, worth 4.
    expect(setValue(trio('infantry', 'infantry', 'wild'), FIXED, 0)).toBe(4)

    // Infantry, cavalry and a wild can be three different, worth 10.
    expect(setValue(trio('infantry', 'cavalry', 'wild'), FIXED, 0)).toBe(10)

    // One infantry and two wilds could be three infantry, worth 4, or three
    // different, worth 10. It takes the 10.
    expect(setValue(trio('infantry', 'wild', 'wild'), FIXED, 0)).toBe(10)
  })
})

describe('what a set is worth, rising', () => {
  it('follows the listed values for the first sets', () => {
    RISING_SET_VALUES.forEach((expected, traded) => {
      expect(risingValueOf(traded)).toBe(expected)
    })
  })

  it('keeps rising by five after the list runs out', () => {
    const last = RISING_SET_VALUES[RISING_SET_VALUES.length - 1] as number

    const noCeiling = Number.POSITIVE_INFINITY

    expect(risingValueOf(RISING_SET_VALUES.length, noCeiling)).toBe(last + 5)
    expect(risingValueOf(RISING_SET_VALUES.length + 1, noCeiling)).toBe(last + 10)
  })

  // Measured 2026-09-07: capping at 12 made the numbers sane, a biggest
  // stack of 8961 rather than 1337626, but did NOT change whether games
  // finish. So the ceiling was left off, until Nick watched a one-on-one
  // game hand both sides hundreds of armies a turn. See plan 4.10 and 4.16.
  it('can be given a ceiling', () => {
    expect(risingValueOf(0, 12)).toBe(4)
    expect(risingValueOf(4, 12)).toBe(12)
    expect(risingValueOf(5, 12)).toBe(12)
    expect(risingValueOf(50, 12)).toBe(12)
  })

  it('stops at the ceiling by default', () => {
    expect(risingValueOf(50)).toBe(RISING_SET_CAP)
    expect(risingValueOf(500)).toBe(RISING_SET_CAP)
  })

  it('ignores which symbols the cards carry', () => {
    const cheap = setValue(trio('infantry', 'infantry', 'infantry'), RISING, 3)
    const dear = setValue(trio('infantry', 'cavalry', 'artillery'), RISING, 3)

    expect(cheap).toBe(dear)
  })

  // The rule that ends the game. The tenth set is worth far more than the
  // first, so nobody can sit on the board forever.
  it('makes a late set worth much more than an early one', () => {
    expect(risingValueOf(10)).toBeGreaterThan(risingValueOf(0) * 4)
  })
})

describe('a set that is not a set has no value', () => {
  it('throws rather than guessing', () => {
    expect(() =>
      setValue(trio('infantry', 'infantry', 'cavalry'), FIXED, 0),
    ).toThrow(/not a set/)
  })
})

describe('finding sets in a hand', () => {
  it('finds nothing in two cards', () => {
    expect(setsInHand([card('infantry'), card('infantry')])).toEqual([])
  })

  it('finds nothing in three cards that do not make a set', () => {
    expect(
      setsInHand([card('infantry'), card('infantry'), card('cavalry')]),
    ).toEqual([])
  })

  it('finds the one set in three cards that do', () => {
    expect(
      setsInHand([card('infantry'), card('cavalry'), card('artillery')]),
    ).toHaveLength(1)
  })

  it('finds every set when a hand holds more than one', () => {
    // Four infantry make four different sets of three.
    const hand = [
      card('infantry'),
      card('infantry'),
      card('infantry'),
      card('infantry'),
    ]

    expect(setsInHand(hand)).toHaveLength(4)
  })

  it('returns whole cards, so a caller can trade one it found', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const found = setsInHand(hand)[0]

    expect(found?.map((each) => each.id).sort()).toEqual(
      hand.map((each) => each.id).sort(),
    )
  })
})

describe('being forced to trade', () => {
  it('does not force a trade at four cards', () => {
    expect(mustTradeASet([1, 2, 3, 4].map(() => card('infantry')))).toBe(false)
  })

  it('forces a trade at five cards', () => {
    expect(mustTradeASet([1, 2, 3, 4, 5].map(() => card('infantry')))).toBe(
      true,
    )
  })
})
