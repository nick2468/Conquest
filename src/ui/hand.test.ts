import { describe, expect, it } from 'vitest'

import type { Card, CardSymbol, GameOptions, GameState } from '../engine'
import { createGame, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { adviseOnHand, asTrio, bestSetIn, describeCard } from './hand'

let made = 0

function card(symbol: CardSymbol, territoryId: string | null = 'wa'): Card {
  made += 1

  return {
    id: `c${made}`,
    symbol,
    territoryId: symbol === 'wild' ? null : territoryId,
  }
}

function gameWith(
  cards: readonly Card[],
  overrides: {
    readonly phase?: GameState['turn']['phase']
    readonly setsTraded?: number
    readonly options?: Partial<GameOptions>
  } = {},
): GameState {
  const base = createGame({
    map: AUSTRALIA,
    players: [
      { name: 'Ann', kind: 'human' },
      { name: 'Bob', kind: 'human' },
    ],
    random: seededRandom(1),
  })

  return {
    ...base,
    options: { ...base.options, ...overrides.options },
    players: base.players.map((player) =>
      player.id === 'p1' ? { ...player, cards } : player,
    ),
    deck: { ...base.deck, setsTraded: overrides.setsTraded ?? 0 },
    turn: {
      ...base.turn,
      playerId: 'p1',
      phase: overrides.phase ?? 'reinforce',
    },
  }
}

function ids(cards: readonly Card[]): string[] {
  return cards.map((each) => each.id)
}

describe('three cards, or nothing', () => {
  it('gives back three cards as a set to check', () => {
    const three = [card('infantry'), card('cavalry'), card('artillery')]

    expect(asTrio(three)).toHaveLength(3)
  })

  it('gives back nothing for two or four', () => {
    expect(asTrio([card('infantry'), card('cavalry')])).toBeNull()
    expect(
      asTrio([
        card('infantry'),
        card('cavalry'),
        card('artillery'),
        card('wild'),
      ]),
    ).toBeNull()
  })
})

describe('advice on a hand', () => {
  it('asks the player to pick three when none are picked', () => {
    const hand = [card('infantry'), card('cavalry')]
    const advice = adviseOnHand(gameWith(hand), hand, [])

    expect(advice.canTrade).toBe(false)
    expect(advice.message).toContain('Pick three')
  })

  it('says three cards are not a set when they are not', () => {
    const hand = [card('infantry'), card('infantry'), card('cavalry')]
    const advice = adviseOnHand(gameWith(hand), hand, ids(hand))

    expect(advice.canTrade).toBe(false)
    expect(advice.message).toContain('not a set')
    // The message says what a set IS, so the player learns the rule from it.
    expect(advice.message).toContain('three of the same')
  })

  it('says what a good set is worth', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const advice = adviseOnHand(gameWith(hand), hand, ids(hand))

    expect(advice.canTrade).toBe(true)
    // Rising value, first set of the game, is 4.
    expect(advice.value).toBe(4)
    expect(advice.message).toContain('4 armies')
  })

  it('follows the rising value as the game goes on', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const advice = adviseOnHand(
      gameWith(hand, { setsTraded: 4 }),
      hand,
      ids(hand),
    )

    expect(advice.value).toBe(12)
  })

  it('follows the fixed value when that is the setting', () => {
    const hand = [card('cavalry'), card('cavalry'), card('cavalry')]
    const advice = adviseOnHand(
      gameWith(hand, { options: { cardSetValue: 'fixed' }, setsTraded: 4 }),
      hand,
      ids(hand),
    )

    // Three cavalry are always worth 6, however many sets went before.
    expect(advice.value).toBe(6)
  })

  it('refuses outside the reinforce phase, and says why', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const advice = adviseOnHand(
      gameWith(hand, { phase: 'attack' }),
      hand,
      ids(hand),
    )

    expect(advice.canTrade).toBe(false)
    expect(advice.message).toContain('start of your turn')
  })

  it('ignores a card the player no longer holds', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const advice = adviseOnHand(gameWith(hand), hand, [
      ...ids(hand).slice(0, 2),
      'gone',
    ])

    expect(advice.canTrade).toBe(false)
  })
})

describe('being forced to trade', () => {
  const forcedHand = [
    card('infantry'),
    card('cavalry'),
    card('artillery'),
    card('infantry'),
    card('cavalry'),
  ]

  it('is not forced at four cards', () => {
    const four = forcedHand.slice(0, 4)

    expect(adviseOnHand(gameWith(four), four, []).forced).toBe(false)
  })

  it('is forced at five cards', () => {
    expect(adviseOnHand(gameWith(forcedHand), forcedHand, []).forced).toBe(
      true,
    )
  })

  it('says so plainly, with the count', () => {
    const advice = adviseOnHand(gameWith(forcedHand), forcedHand, [])

    expect(advice.message).toContain('5 cards')
    expect(advice.message).toContain('must trade')
  })
})

describe('choosing a set for the player', () => {
  it('finds nothing in a hand with no set', () => {
    const hand = [card('infantry'), card('infantry'), card('cavalry')]

    expect(bestSetIn(gameWith(hand), hand)).toBeNull()
  })

  it('always finds one in five cards', () => {
    // Any five cards hold a set. Five cards over three symbols means either
    // three of one symbol, or all three symbols present.
    const hands: CardSymbol[][] = [
      ['infantry', 'infantry', 'infantry', 'cavalry', 'cavalry'],
      ['infantry', 'infantry', 'cavalry', 'cavalry', 'artillery'],
      ['artillery', 'artillery', 'artillery', 'artillery', 'cavalry'],
      ['wild', 'infantry', 'infantry', 'cavalry', 'cavalry'],
    ]

    for (const symbols of hands) {
      const hand = symbols.map((symbol) => card(symbol))

      expect(bestSetIn(gameWith(hand), hand), symbols.join('+')).not.toBeNull()
    }
  })

  it('picks the dearest set when the value is fixed', () => {
    // Three artillery are worth 8, three different are worth 10.
    const hand = [
      card('artillery'),
      card('artillery'),
      card('artillery'),
      card('infantry'),
      card('cavalry'),
    ]

    const state = gameWith(hand, { options: { cardSetValue: 'fixed' } })
    const best = bestSetIn(state, hand)
    const symbols = (best ?? []).map((each) => each.symbol).sort()

    expect(symbols).toEqual(['artillery', 'cavalry', 'infantry'])
  })

  it('gives back cards the player really holds', () => {
    const hand = [card('infantry'), card('cavalry'), card('artillery')]
    const best = bestSetIn(gameWith(hand), hand)

    for (const each of best ?? []) {
      expect(hand.some((held) => held.id === each.id)).toBe(true)
    }
  })
})

describe('what a card says', () => {
  it('names the symbol and the territory', () => {
    const one = card('cavalry', 'tas')
    const words = describeCard(gameWith([one]), one)

    expect(words.symbol).toBe('Cavalry')
    expect(words.place).toBe('Tasmania')
  })

  it('says a wild card fits anywhere', () => {
    const one = card('wild')
    const words = describeCard(gameWith([one]), one)

    expect(words.symbol).toBe('Wild')
    expect(words.place).toBe('Any territory')
  })
})
