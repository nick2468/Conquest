import { describe, expect, it } from 'vitest'

import type { Card, GameState } from '../engine'
import { createGame, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { setReadyToTrade } from './hand'

/**
 * Nick, after losing games: "sometimes we've lost a game and realised that
 * we should have traded a set." Nothing on screen ever said so.
 *
 * This is the rule behind the green button and the bell. The screen asks
 * one question of it and does as it is told, so the whole thing is tested
 * here with no browser.
 */

function aGame(): GameState {
  return createGame({
    map: AUSTRALIA,
    random: seededRandom(7),
    players: [
      { name: 'One', kind: 'human', colour: '#c8453b' },
      { name: 'Two', kind: 'cautious', colour: '#2f6fb0' },
    ],
  })
}

function card(id: string, symbol: Card['symbol']): Card {
  return { id, symbol, territoryId: null }
}

/** The same game, with the player whose turn it is holding these cards. */
function holding(state: GameState, cards: readonly Card[]): GameState {
  return {
    ...state,
    turn: { ...state.turn, phase: 'reinforce' },
    players: state.players.map((player) =>
      player.id === state.turn.playerId ? { ...player, cards } : player,
    ),
  }
}

const THREE_THE_SAME = [
  card('a', 'infantry'),
  card('b', 'infantry'),
  card('c', 'infantry'),
]

const ALL_DIFFERENT = [
  card('a', 'infantry'),
  card('b', 'cavalry'),
  card('c', 'artillery'),
]

const NOT_A_SET = [
  card('a', 'infantry'),
  card('b', 'infantry'),
  card('c', 'cavalry'),
]

describe('spotting a set the player could trade', () => {
  it('says nothing when the player holds no cards', () => {
    expect(setReadyToTrade(holding(aGame(), []))).toBeNull()
  })

  it('says nothing when three cards are not a set', () => {
    expect(setReadyToTrade(holding(aGame(), NOT_A_SET))).toBeNull()
  })

  it('spots three of the same', () => {
    expect(setReadyToTrade(holding(aGame(), THREE_THE_SAME))).not.toBeNull()
  })

  it('spots three all different', () => {
    expect(setReadyToTrade(holding(aGame(), ALL_DIFFERENT))).not.toBeNull()
  })

  it('spots a set hidden among cards that are not one', () => {
    // This is the real case. Five cards, and the set is not the first
    // three. Seeing it while thinking about an attack is the job nobody
    // should have to do.
    const five = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'infantry'),
      card('d', 'infantry'),
      card('e', 'cavalry'),
    ]

    const waiting = setReadyToTrade(holding(aGame(), five))

    expect(waiting).not.toBeNull()
    expect(waiting?.cards).toHaveLength(3)
  })

  it('counts a wild card as anything', () => {
    const withWild = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'wild'),
    ]

    expect(setReadyToTrade(holding(aGame(), withWild))).not.toBeNull()
  })

  it('says what the set is worth, so the button can say so too', () => {
    const waiting = setReadyToTrade(holding(aGame(), THREE_THE_SAME))

    expect(waiting?.value).toBeGreaterThan(0)
  })

  it('says nothing outside the reinforce phase', () => {
    // A set that cannot be traded this moment is not worth shouting about.
    // The player would ring the bell, look, and find the button dead.
    const reinforcing = holding(aGame(), THREE_THE_SAME)
    const attacking: GameState = {
      ...reinforcing,
      turn: { ...reinforcing.turn, phase: 'attack' },
    }

    expect(setReadyToTrade(attacking)).toBeNull()
  })

  it('says nothing again once the set has gone', () => {
    const before = holding(aGame(), THREE_THE_SAME)

    expect(setReadyToTrade(before)).not.toBeNull()
    expect(setReadyToTrade(holding(before, []))).toBeNull()
  })
})
