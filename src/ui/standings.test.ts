import { describe, expect, it } from 'vitest'

import type { GameState } from '../engine'
import { applyAction, createGame, seededRandom } from '../engine'
import { chooseSimpleAction } from '../engine/testing/simplePlayer'
import { AUSTRALIA } from '../maps/australia'
import { armies, cards, territories } from './plurals'
import { attacksIn, standingsIn } from './standings'

/**
 * A real finished game.
 *
 * Built by playing one, rather than by writing a state by hand. The winner
 * screen is the last thing anybody sees, so it should be checked against a
 * game that really happened.
 */
function finishedGame(seed: number, playerCount: number): GameState {
  const random = seededRandom(seed)
  const choices = seededRandom(seed + 1000)

  let state = createGame({
    map: AUSTRALIA,
    players: Array.from({ length: playerCount }, (_unused, index) => ({
      name: `Player ${index + 1}`,
      kind: 'computer' as const,
    })),
    random,
  })

  for (let step = 0; step < 40000 && state.winnerId === null; step += 1) {
    state = applyAction(state, chooseSimpleAction(state, choices), random)
  }

  return state
}

describe('counting things in readable English', () => {
  // "place 1 armies" appeared on screen during a real game.
  it('uses the singular for one', () => {
    expect(armies(1)).toBe('1 army')
    expect(territories(1)).toBe('1 territory')
    expect(cards(1)).toBe('1 card')
  })

  it('uses the plural for everything else', () => {
    expect(armies(0)).toBe('0 armies')
    expect(armies(2)).toBe('2 armies')
    expect(territories(7)).toBe('7 territories')
    expect(cards(5)).toBe('5 cards')
  })
})

describe('who finished where', () => {
  const state = finishedGame(1, 3)

  it('was a game that really ended', () => {
    expect(state.winnerId).not.toBeNull()
  })

  it('lists every player exactly once', () => {
    const listed = standingsIn(state).map((each) => each.player.id)

    expect(listed).toHaveLength(state.players.length)
    expect(new Set(listed).size).toBe(state.players.length)
  })

  it('puts the winner first', () => {
    const first = standingsIn(state)[0]

    expect(first?.player.id).toBe(state.winnerId)
    expect(first?.place).toBe(1)
  })

  it('numbers the places from one, with no gaps', () => {
    const places = standingsIn(state).map((each) => each.place)

    expect(places).toEqual(places.map((_unused, index) => index + 1))
  })

  // The player who went out last held on longest, so they come second.
  it('orders the beaten players by how long they lasted', () => {
    const beaten = standingsIn(state).slice(1)

    const wentOutAt = beaten.map((each) =>
      state.log.findIndex(
        (entry) => entry.text === `${each.player.name} is out of the game.`,
      ),
    )

    for (let index = 1; index < wentOutAt.length; index += 1) {
      expect(wentOutAt[index - 1] as number).toBeGreaterThan(
        wentOutAt[index] as number,
      )
    }
  })

  it('works for six players as well as three', () => {
    const six = finishedGame(4, 6)

    expect(standingsIn(six)).toHaveLength(6)
    expect(standingsIn(six)[0]?.player.id).toBe(six.winnerId)
  })
})

describe('counting the attacks', () => {
  it('counts every attack in a finished game', () => {
    const state = finishedGame(1, 3)

    expect(attacksIn(state)).toBeGreaterThan(0)
    expect(attacksIn(state)).toBeLessThanOrEqual(state.log.length)
  })

  it('counts none in a game nobody has played yet', () => {
    const fresh = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'Ann', kind: 'human' },
        { name: 'Bob', kind: 'human' },
      ],
      random: seededRandom(1),
    })

    expect(attacksIn(fresh)).toBe(0)
  })
})
