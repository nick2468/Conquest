import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_ARMIES } from './balance'
import { seededRandom } from './random'
import type { GameState, PlayerId } from './types'
import { DEFAULT_OPTIONS, createGame } from './setup'
import type { NewPlayer } from './setup'

function somePlayers(count: number): NewPlayer[] {
  return Array.from({ length: count }, (_unused, index) => ({
    name: `Player ${index + 1}`,
    kind: 'human' as const,
  }))
}

function newGame(playerCount: number, seed = 1): GameState {
  return createGame({
    map: AUSTRALIA,
    players: somePlayers(playerCount),
    random: seededRandom(seed),
  })
}

function armiesOwnedBy(state: GameState, playerId: PlayerId): number {
  return Object.values(state.territories)
    .filter((territory) => territory.ownerId === playerId)
    .reduce((total, territory) => total + territory.armies, 0)
}

function territoryCountsByPlayer(state: GameState): number[] {
  return state.players.map(
    (player) =>
      Object.values(state.territories).filter(
        (territory) => territory.ownerId === player.id,
      ).length,
  )
}

describe('dealing the territories', () => {
  it('gives every territory an owner', () => {
    const state = newGame(3)

    expect(Object.keys(state.territories)).toHaveLength(
      AUSTRALIA.territories.length,
    )

    for (const territory of Object.values(state.territories)) {
      expect(territory.ownerId).not.toBeNull()
    }
  })

  it('leaves nobody with more than one territory over anyone else', () => {
    for (let players = MIN_PLAYERS; players <= MAX_PLAYERS; players += 1) {
      const counts = territoryCountsByPlayer(newGame(players))

      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    }
  })

  it('deals every territory exactly once', () => {
    const state = newGame(4)
    const dealt = territoryCountsByPlayer(state).reduce(
      (total, count) => total + count,
      0,
    )

    expect(dealt).toBe(AUSTRALIA.territories.length)
  })
})

describe('spreading the armies', () => {
  it('gives each player exactly their starting armies', () => {
    for (let players = MIN_PLAYERS; players <= MAX_PLAYERS; players += 1) {
      const state = newGame(players)

      for (const player of state.players) {
        expect(armiesOwnedBy(state, player.id)).toBe(
          STARTING_ARMIES[players] as number,
        )
      }
    }
  })

  it('leaves at least one army on every territory', () => {
    const state = newGame(5)

    for (const territory of Object.values(state.territories)) {
      expect(territory.armies).toBeGreaterThanOrEqual(1)
    }
  })

  it('spreads the armies rather than stacking them in one place', () => {
    // 2 players on 10 territories is the most lopsided case: 40 armies over
    // 5 territories each. Even so, no territory should hold them all.
    const state = newGame(2)
    const biggest = Math.max(
      ...Object.values(state.territories).map(
        (territory) => territory.armies,
      ),
    )

    expect(biggest).toBeLessThan(STARTING_ARMIES[2] as number)
  })
})

describe('the game that comes out', () => {
  it('is ready for the first player to reinforce', () => {
    const state = newGame(3)

    expect(state.turn.playerId).toBe('p1')
    expect(state.turn.phase).toBe('reinforce')
    expect(state.round).toBe(1)
    expect(state.winnerId).toBeNull()
  })

  it('gives the first player armies to place', () => {
    const state = newGame(3)

    // 10 territories over 3 players means 4 or 3 each, which is below the
    // minimum of 3 armies from territories alone. So it is at least 3.
    expect(state.turn.armiesToPlace).toBeGreaterThanOrEqual(3)
  })

  it('gives every player a colour and no cards', () => {
    const state = newGame(4)

    const colours = state.players.map((player) => player.colour)

    expect(new Set(colours).size).toBe(4)

    for (const player of state.players) {
      expect(player.cards).toEqual([])
      expect(player.isEliminated).toBe(false)
    }
  })

  it('builds a deck with one card per territory plus the wild cards', () => {
    const state = newGame(3)

    expect(state.deck.undrawn).toHaveLength(AUSTRALIA.territories.length + 2)
    expect(state.deck.discarded).toEqual([])
    expect(state.deck.setsTraded).toBe(0)
  })

  it('starts the log with what happened', () => {
    const state = newGame(3)

    expect(state.log).toHaveLength(1)
    expect(state.log[0]?.text).toContain('Australia')
  })

  it('uses the default options when none are given', () => {
    const state = newGame(3)

    expect(state.options.cardSetValue).toBe('rising')
    expect(state.options.fortifyDistance).toBe('connected')
  })
})

describe('the same seed gives the same game', () => {
  it('deals the same board twice', () => {
    expect(newGame(3, 12345).territories).toEqual(
      newGame(3, 12345).territories,
    )
  })

  it('deals a different board for a different seed', () => {
    expect(newGame(3, 1).territories).not.toEqual(newGame(3, 2).territories)
  })
})

describe('setting up refuses a game that cannot be played', () => {
  it('refuses one player', () => {
    expect(() => newGame(1)).toThrow(/2 to 6 players/)
  })

  it('refuses seven players', () => {
    expect(() => newGame(7)).toThrow(/2 to 6 players/)
  })

  it('refuses more players than the map has territories', () => {
    const tinyMap = {
      ...AUSTRALIA,
      territories: AUSTRALIA.territories.slice(0, 2),
    }

    expect(() =>
      createGame({
        map: tinyMap,
        players: somePlayers(3),
        random: seededRandom(1),
      }),
    ).toThrow(/not enough for 3 players/)
  })
})

// ------------------------------------------------- placing armies by hand

describe('a game where players place their first armies', () => {
  function byHand(playerCount: number, seed = 1): GameState {
    return createGame({
      map: AUSTRALIA,
      players: somePlayers(playerCount),
      random: seededRandom(seed),
      options: { ...DEFAULT_OPTIONS, armyPlacement: 'byHand' },
    })
  }

  it('starts in the setup phase, not reinforcing', () => {
    expect(byHand(3).turn.phase).toBe('setup')
  })

  it('puts one army on every territory and holds the rest back', () => {
    const state = byHand(3)

    for (const territory of Object.values(state.territories)) {
      expect(territory.armies).toBe(1)
    }
  })

  it('leaves each player holding what they have not placed', () => {
    for (let players = MIN_PLAYERS; players <= MAX_PLAYERS; players += 1) {
      const state = byHand(players)

      for (const player of state.players) {
        const owned = Object.values(state.territories).filter(
          (each) => each.ownerId === player.id,
        ).length

        expect(player.reserve).toBe((STARTING_ARMIES[players] as number) - owned)
      }
    }
  })

  it('still adds up to the right number of armies for each player', () => {
    const state = byHand(4)

    for (const player of state.players) {
      expect(armiesOwnedBy(state, player.id) + player.reserve).toBe(
        STARTING_ARMIES[4] as number,
      )
    }
  })

  it('spreads them itself when the option says automatic', () => {
    const state = createGame({
      map: AUSTRALIA,
      players: somePlayers(3),
      random: seededRandom(1),
      options: { ...DEFAULT_OPTIONS, armyPlacement: 'automatic' },
    })

    expect(state.turn.phase).toBe('reinforce')

    for (const player of state.players) {
      expect(player.reserve).toBe(0)
    }
  })

  it('says in the log which way the game was set up', () => {
    expect(byHand(3).log[0]?.text).toContain('by hand')
    expect(newGame(3).log[0]?.text).not.toContain('by hand')
  })
})
