import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { scriptedDice } from './dice'
import type { GameAction } from './game'
import {
  IllegalActionError,
  applyAction,
  armyLimitFor,
  legalActions,
} from './game'
import { fixedRandom, seededRandom } from './random'
import { createGame } from './setup'
import type { Board, Card, GameState, TerritoryId } from './types'

/**
 * A board set up by hand, so a test can say exactly who owns what.
 *
 * Anything not named goes to 'p2' with one army.
 */
function boardWhere(mine: Readonly<Record<string, number>>): Board {
  const board: Record<string, { ownerId: string; armies: number }> = {}

  for (const each of AUSTRALIA.territories) {
    const armies = mine[each.id]

    board[each.id] =
      armies === undefined
        ? { ownerId: 'p2', armies: 1 }
        : { ownerId: 'p1', armies }
  }

  return board
}

/** A two-player game with the board and turn set exactly as a test needs. */
function gameWith(
  board: Board,
  turn: Partial<GameState['turn']> = {},
  extra: Partial<GameState> = {},
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
    territories: board,
    ...extra,
    turn: {
      playerId: 'p1',
      phase: 'attack',
      armiesToPlace: 0,
      hasConquered: false,
      hasFortified: false,
      pendingOccupation: null,
      lastAttack: null,
      ...turn,
    },
  }
}

function card(id: string, symbol: Card['symbol']): Card {
  return { id, symbol, territoryId: symbol === 'wild' ? null : 'wa' }
}

function armiesOn(state: GameState, id: TerritoryId): number {
  return state.territories[id]?.armies ?? 0
}

function ownerOf(state: GameState, id: TerritoryId): string | null {
  return state.territories[id]?.ownerId ?? null
}

const NO_DICE = fixedRandom(0)

// ------------------------------------------------------------- reinforcing

describe('placing armies', () => {
  it('adds them to a territory you own', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    const after = applyAction(
      state,
      { type: 'placeArmies', territoryId: 'wa', count: 2 },
      NO_DICE,
    )

    expect(armiesOn(after, 'wa')).toBe(3)
    expect(after.turn.armiesToPlace).toBe(1)
    expect(after.turn.phase).toBe('reinforce')
  })

  it('moves to the attack phase once every army is placed', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    const after = applyAction(
      state,
      { type: 'placeArmies', territoryId: 'wa', count: 3 },
      NO_DICE,
    )

    expect(after.turn.phase).toBe('attack')
  })

  it('refuses a territory somebody else owns', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    expect(() =>
      applyAction(
        state,
        { type: 'placeArmies', territoryId: 'nt', count: 1 },
        NO_DICE,
      ),
    ).toThrow(IllegalActionError)
  })

  it('refuses more armies than are left to place', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    expect(() =>
      applyAction(
        state,
        { type: 'placeArmies', territoryId: 'wa', count: 4 },
        NO_DICE,
      ),
    ).toThrow(/Only 3 armies are left/)
  })

  // Spec S8. Holding armies back would be a second kind of reserve.
  it('refuses an attack while armies are still to place', () => {
    const state = gameWith(boardWhere({ wa: 5 }), {
      phase: 'reinforce',
      armiesToPlace: 2,
    })

    expect(() =>
      applyAction(state, { type: 'attack', fromId: 'wa', toId: 'nt' }, NO_DICE),
    ).toThrow(/attack phase/)
  })
})

// ------------------------------------------------------------------- cards

describe('trading cards', () => {
  function withCards(cards: readonly Card[], setsTraded = 0): GameState {
    const base = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    return {
      ...base,
      players: base.players.map((player) =>
        player.id === 'p1' ? { ...player, cards } : player,
      ),
      deck: { ...base.deck, setsTraded },
    }
  }

  it('adds the value of the set to the armies to place', () => {
    const cards = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'artillery'),
    ]

    const after = applyAction(
      withCards(cards),
      { type: 'tradeCards', cardIds: ['a', 'b', 'c'] },
      NO_DICE,
    )

    // Rising value, first set of the game, is 4.
    expect(after.turn.armiesToPlace).toBe(3 + 4)
  })

  it('takes the cards out of the hand and counts the trade', () => {
    const cards = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'artillery'),
      card('d', 'infantry'),
    ]

    const after = applyAction(
      withCards(cards),
      { type: 'tradeCards', cardIds: ['a', 'b', 'c'] },
      NO_DICE,
    )

    expect(after.players[0]?.cards.map((each) => each.id)).toEqual(['d'])
    expect(after.deck.setsTraded).toBe(1)
    expect(after.deck.discarded).toHaveLength(3)
  })

  it('refuses three cards that are not a set', () => {
    const cards = [
      card('a', 'infantry'),
      card('b', 'infantry'),
      card('c', 'cavalry'),
    ]

    expect(() =>
      applyAction(
        withCards(cards),
        { type: 'tradeCards', cardIds: ['a', 'b', 'c'] },
        NO_DICE,
      ),
    ).toThrow(/not a set/)
  })

  it('refuses a card the player does not hold', () => {
    const cards = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'artillery'),
    ]

    expect(() =>
      applyAction(
        withCards(cards),
        { type: 'tradeCards', cardIds: ['a', 'b', 'zz'] },
        NO_DICE,
      ),
    ).toThrow(/does not hold/)
  })

  it('refuses the same card three times', () => {
    const cards = [card('a', 'wild'), card('b', 'cavalry')]

    expect(() =>
      applyAction(
        withCards(cards),
        { type: 'tradeCards', cardIds: ['a', 'a', 'a'] },
        NO_DICE,
      ),
    ).toThrow(/three different cards/)
  })

  // Five cards forces a trade. It stops a player hoarding all game.
  it('will not let a player with five cards do anything else', () => {
    const cards = [
      card('a', 'infantry'),
      card('b', 'cavalry'),
      card('c', 'artillery'),
      card('d', 'infantry'),
      card('e', 'cavalry'),
    ]

    const state = withCards(cards)

    expect(() =>
      applyAction(
        state,
        { type: 'placeArmies', territoryId: 'wa', count: 1 },
        NO_DICE,
      ),
    ).toThrow(/must trade a set first/)

    expect(
      legalActions(state).every((action) => action.type === 'tradeCards'),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------- attacking

describe('attacking', () => {
  it('takes armies off both sides when neither wins outright', () => {
    const base = gameWith(boardWhere({ wa: 3 }))
    const state: GameState = {
      ...base,
      territories: { ...base.territories, nt: { ownerId: 'p2', armies: 2 } },
    }

    // Both roll two dice. Attacker 6 and 1, defender 2 and 1.
    // Highest pair: 6 beats 2, the defender loses one.
    // Second pair: 1 ties 1, and a tie goes to the defender.
    const after = applyAction(
      state,
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 1, 2, 1]),
    )

    expect(armiesOn(after, 'nt')).toBe(1)
    expect(armiesOn(after, 'wa')).toBe(2)
    expect(after.turn.phase).toBe('attack')
  })

  it('costs the attacker when the defender rolls higher', () => {
    const state = gameWith(boardWhere({ wa: 3 }), {}, {})
    const board = { ...state.territories, nt: { ownerId: 'p2', armies: 2 } }

    const after = applyAction(
      { ...state, territories: board },
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([1, 1, 6, 6]),
    )

    expect(armiesOn(after, 'wa')).toBe(1)
    expect(armiesOn(after, 'nt')).toBe(2)
  })

  it('captures the territory and garrisons it at once', () => {
    const state = gameWith(boardWhere({ wa: 6 }))

    const after = applyAction(
      state,
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 5, 4, 1]),
    )

    expect(ownerOf(after, 'nt')).toBe('p1')
    // Three dice were rolled, so three armies move in straight away. The
    // territory is never left standing empty.
    expect(armiesOn(after, 'nt')).toBe(3)
    expect(armiesOn(after, 'wa')).toBe(3)
    expect(after.turn.phase).toBe('occupy')
    expect(after.turn.hasConquered).toBe(true)
    expect(after.turn.pendingOccupation).toEqual({
      fromId: 'wa',
      toId: 'nt',
      minimumArmies: 3,
      maximumArmies: 5,
    })
  })

  // With four armies attacking, three dice are rolled and three armies must
  // move in, leaving one behind. There is nothing left to decide, so the
  // game does not stop to ask.
  it('does not stop to ask when there is no choice to make', () => {
    const state = gameWith(boardWhere({ wa: 4 }))

    const after = applyAction(
      state,
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 5, 4, 1]),
    )

    expect(armiesOn(after, 'nt')).toBe(3)
    expect(armiesOn(after, 'wa')).toBe(1)
    expect(after.turn.phase).toBe('attack')
    expect(after.turn.pendingOccupation).toBeNull()
  })

  it('refuses an attack from a territory holding one army', () => {
    const state = gameWith(boardWhere({ wa: 1 }))

    expect(() =>
      applyAction(state, { type: 'attack', fromId: 'wa', toId: 'nt' }, NO_DICE),
    ).toThrow(/at least 2/)
  })

  it('refuses an attack across a border that does not exist', () => {
    const state = gameWith(boardWhere({ wa: 5 }))

    expect(() =>
      applyAction(state, { type: 'attack', fromId: 'wa', toId: 'tas' }, NO_DICE),
    ).toThrow(/does not border/)
  })

  it('refuses an attack on your own territory', () => {
    const state = gameWith(boardWhere({ wa: 5, nt: 2 }))

    expect(() =>
      applyAction(state, { type: 'attack', fromId: 'wa', toId: 'nt' }, NO_DICE),
    ).toThrow(/already owns/)
  })
})

// ----------------------------------------------------------------- occupying

describe('occupying a captured territory', () => {
  function afterCapture(): GameState {
    return applyAction(
      gameWith(boardWhere({ wa: 6 })),
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 5, 4, 1]),
    )
  }

  it('moves the armies and goes back to attacking', () => {
    const after = applyAction(afterCapture(), { type: 'occupy', count: 4 }, NO_DICE)

    expect(armiesOn(after, 'nt')).toBe(4)
    expect(armiesOn(after, 'wa')).toBe(2)
    expect(after.turn.phase).toBe('attack')
    expect(after.turn.pendingOccupation).toBeNull()
  })

  it('refuses fewer than the dice rolled', () => {
    expect(() =>
      applyAction(afterCapture(), { type: 'occupy', count: 2 }, NO_DICE),
    ).toThrow(/between 3 and 5/)
  })

  it('refuses a move that would empty the attacking territory', () => {
    expect(() =>
      applyAction(afterCapture(), { type: 'occupy', count: 6 }, NO_DICE),
    ).toThrow(/between 3 and 5/)
  })

  it('refuses occupying when nothing was captured', () => {
    expect(() =>
      applyAction(gameWith(boardWhere({ wa: 5 })), { type: 'occupy', count: 1 }, NO_DICE),
    ).toThrow(/Nothing has just been captured/)
  })
})

// -------------------------------------------------- eliminating and winning

describe('eliminating a player and winning', () => {
  /** Ann owns everything but Tasmania, which Bob holds with one army. */
  function almostWon(): GameState {
    const board: Record<string, { ownerId: string; armies: number }> = {}

    for (const each of AUSTRALIA.territories) {
      board[each.id] =
        each.id === 'tas'
          ? { ownerId: 'p2', armies: 1 }
          : { ownerId: 'p1', armies: 3 }
    }

    return gameWith(board)
  }

  it('marks a player with no territories as out', () => {
    const after = applyAction(
      almostWon(),
      { type: 'attack', fromId: 'vic', toId: 'tas' },
      scriptedDice([6, 5, 1]),
    )

    expect(after.players.find((each) => each.id === 'p2')?.isEliminated).toBe(
      true,
    )
  })

  it('declares the winner and stops the game', () => {
    const after = applyAction(
      almostWon(),
      { type: 'attack', fromId: 'vic', toId: 'tas' },
      scriptedDice([6, 5, 1]),
    )

    expect(after.winnerId).toBe('p1')
    expect(after.turn.phase).toBe('gameOver')
    expect(legalActions(after)).toEqual([])
  })

  it('records both in the log', () => {
    const after = applyAction(
      almostWon(),
      { type: 'attack', fromId: 'vic', toId: 'tas' },
      scriptedDice([6, 5, 1]),
    )

    const words = after.log.map((entry) => entry.text).join(' ')

    expect(words).toContain('is out of the game')
    expect(words).toContain('has won')
  })

  it('refuses any action once the game is over', () => {
    const after = applyAction(
      almostWon(),
      { type: 'attack', fromId: 'vic', toId: 'tas' },
      scriptedDice([6, 5, 1]),
    )

    expect(() =>
      applyAction(after, { type: 'endAttackPhase' }, NO_DICE),
    ).toThrow(/already won/)
  })
})

// ------------------------------------------------------------ ending a turn

describe('ending a turn', () => {
  it('passes play to the next player and gives them armies', () => {
    const state = gameWith(boardWhere({ wa: 5 }), { phase: 'fortify' })
    const after = applyAction(state, { type: 'skipFortify' }, NO_DICE)

    expect(after.turn.playerId).toBe('p2')
    expect(after.turn.phase).toBe('reinforce')
    expect(after.turn.armiesToPlace).toBeGreaterThanOrEqual(3)
    expect(after.turn.hasConquered).toBe(false)
  })

  it('moves the round on when play wraps back to the first player', () => {
    const state = gameWith(boardWhere({ wa: 5 }), {
      playerId: 'p2',
      phase: 'fortify',
    })

    const after = applyAction(state, { type: 'skipFortify' }, NO_DICE)

    expect(after.turn.playerId).toBe('p1')
    expect(after.round).toBe(state.round + 1)
  })

  it('gives a card to a player who conquered', () => {
    const state = gameWith(boardWhere({ wa: 5 }), {
      phase: 'fortify',
      hasConquered: true,
    })

    const after = applyAction(state, { type: 'skipFortify' }, seededRandom(1))

    expect(after.players[0]?.cards).toHaveLength(1)
  })

  it('gives no card to a player who conquered nothing', () => {
    const state = gameWith(boardWhere({ wa: 5 }), { phase: 'fortify' })
    const after = applyAction(state, { type: 'skipFortify' }, seededRandom(1))

    expect(after.players[0]?.cards).toHaveLength(0)
  })

  it('skips a player who is out of the game', () => {
    const base = gameWith(boardWhere({ wa: 5 }), { phase: 'fortify' })
    const state: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'p2' ? { ...player, isEliminated: true } : player,
      ),
    }

    // With only one player left the win check fires first, which is correct.
    const after = applyAction(state, { type: 'skipFortify' }, seededRandom(1))

    expect(after.turn.playerId).toBe('p1')
  })

  it('fortifying also ends the turn', () => {
    const state = gameWith(boardWhere({ wa: 5, nt: 1 }), { phase: 'fortify' })
    const after = applyAction(
      state,
      { type: 'fortify', fromId: 'wa', toId: 'nt', count: 3 },
      seededRandom(1),
    )

    expect(armiesOn(after, 'nt')).toBe(4)
    expect(after.turn.playerId).toBe('p2')
  })
})

// ------------------------------------------------------ what is allowed now

describe('legalActions', () => {
  it('offers every territory you own while reinforcing', () => {
    const state = gameWith(boardWhere({ wa: 1, nt: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 3,
    })

    const places = legalActions(state).filter(
      (action) => action.type === 'placeArmies',
    )

    expect(places).toHaveLength(2)
  })

  it('offers every attack you could make, and stopping', () => {
    // wa has 5 armies and borders nt, sa and rot, all held by p2.
    const state = gameWith(boardWhere({ wa: 5 }))
    const actions = legalActions(state)

    expect(
      actions.filter((action) => action.type === 'attack'),
    ).toHaveLength(3)
    expect(
      actions.some((action) => action.type === 'endAttackPhase'),
    ).toBe(true)
  })

  it('offers no attack from a territory holding one army', () => {
    const state = gameWith(boardWhere({ wa: 1 }))

    expect(legalActions(state).filter((a) => a.type === 'attack')).toEqual([])
  })

  it('offers only the occupy move while a capture is pending', () => {
    const captured = applyAction(
      gameWith(boardWhere({ wa: 6 })),
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 5, 4, 1]),
    )

    expect(captured.turn.phase).toBe('occupy')
    expect(legalActions(captured)).toEqual([{ type: 'occupy', count: 3 }])
  })

  it('offers nothing at all once someone has won', () => {
    const board: Record<string, { ownerId: string; armies: number }> = {}

    for (const each of AUSTRALIA.territories) {
      board[each.id] = { ownerId: 'p1', armies: 1 }
    }

    const state = gameWith(board, { phase: 'gameOver' }, { winnerId: 'p1' })

    expect(legalActions(state)).toEqual([])
  })

  // Every action legalActions offers must be one applyAction accepts. If the
  // two ever disagree, the screen offers a move that then throws.
  it('offers nothing that applyAction refuses', () => {
    const phases: Array<Partial<GameState['turn']>> = [
      { phase: 'reinforce', armiesToPlace: 3 },
      { phase: 'attack' },
      { phase: 'fortify' },
    ]

    for (const turn of phases) {
      const state = gameWith(boardWhere({ wa: 5, nt: 3, sa: 2 }), turn)

      for (const action of legalActions(state)) {
        expect(() =>
          applyAction(state, action, seededRandom(1)),
        ).not.toThrow()
      }
    }
  })
})

describe('armyLimitFor', () => {
  it('reports the armies left to place', () => {
    const state = gameWith(boardWhere({ wa: 1 }), {
      phase: 'reinforce',
      armiesToPlace: 4,
    })

    expect(
      armyLimitFor(state, { type: 'placeArmies', territoryId: 'wa', count: 1 }),
    ).toBe(4)
  })

  it('reports what a territory can spare when fortifying', () => {
    const state = gameWith(boardWhere({ wa: 5, nt: 1 }), { phase: 'fortify' })

    expect(
      armyLimitFor(state, {
        type: 'fortify',
        fromId: 'wa',
        toId: 'nt',
        count: 1,
      }),
    ).toBe(4)
  })

  it('reports nothing for an action that carries no number', () => {
    const state = gameWith(boardWhere({ wa: 5 }))

    expect(armyLimitFor(state, { type: 'endAttackPhase' })).toBe(0)
  })
})

// ------------------------------------------------------------ a whole game

/**
 * A player good enough to finish a game. Not a real computer player, which
 * is phase 4. It attacks when it has the advantage and stops when it does
 * not, which is enough to reach a winner.
 */
function chooseAction(state: GameState, random: () => number): GameAction {
  const actions = legalActions(state)

  const places = actions.filter((each) => each.type === 'placeArmies')

  if (places.length > 0) {
    // Put them where they can be used. The first version always chose the
    // first territory on the list, which buried every army in the middle of
    // its own land and left the player unable to attack anybody. One seed
    // then ran forever.
    const frontier = places.filter((action) => {
      if (action.type !== 'placeArmies') {
        return false
      }

      const borders =
        state.map.territories.find(
          (each) => each.id === action.territoryId,
        )?.borders ?? []

      return borders.some(
        (border) =>
          state.territories[border]?.ownerId !== state.turn.playerId,
      )
    })

    const chosen = (frontier.length > 0 ? frontier : places)[
      Math.floor(random() * (frontier.length > 0 ? frontier.length : places.length))
    ] as GameAction

    if (chosen.type === 'placeArmies') {
      return { ...chosen, count: state.turn.armiesToPlace }
    }
  }

  const occupy = actions.find((each) => each.type === 'occupy')

  if (occupy !== undefined && occupy.type === 'occupy') {
    return { ...occupy, count: armyLimitFor(state, occupy) }
  }

  const trade = actions.find((each) => each.type === 'tradeCards')

  if (trade !== undefined) {
    return trade
  }

  const worthwhile = actions.filter((action) => {
    if (action.type !== 'attack') {
      return false
    }

    const mine = state.territories[action.fromId]?.armies ?? 0
    const theirs = state.territories[action.toId]?.armies ?? 0

    return mine > theirs + 1
  })

  if (worthwhile.length > 0) {
    return worthwhile[Math.floor(random() * worthwhile.length)] as GameAction
  }

  const stop = actions.find((each) => each.type === 'endAttackPhase')

  if (stop !== undefined) {
    return stop
  }

  return { type: 'skipFortify' }
}

function playToTheEnd(
  seed: number,
  playerCount: number,
): { readonly state: GameState; readonly steps: number } {
  const random = seededRandom(seed)
  const pick = seededRandom(seed + 1000)

  let state = createGame({
    map: AUSTRALIA,
    players: Array.from({ length: playerCount }, (_unused, index) => ({
      name: `Player ${index + 1}`,
      kind: 'computer' as const,
    })),
    random,
  })

  let steps = 0

  while (state.winnerId === null && steps < 40000) {
    state = applyAction(
      state,
      chooseAction(state, () => pick.nextInt(1000) / 1000),
      random,
    )
    steps += 1

    checkNothingImpossible(state)
  }

  return { state, steps }
}

/** Things that must be true after every single action, all game long. */
function checkNothingImpossible(state: GameState): void {
  for (const [id, each] of Object.entries(state.territories)) {
    if (each.ownerId === null) {
      throw new Error(`${id} has no owner.`)
    }

    if (each.armies < 0) {
      throw new Error(`${id} has ${each.armies} armies.`)
    }

    // No territory is ever empty. The minimum garrison moves in at the
    // moment of capture, so there is no window where one stands empty.
    if (each.armies === 0) {
      throw new Error(`${id} is empty. No territory should ever be empty.`)
    }
  }
}

describe('a whole game', () => {
  it('reaches a winner who owns the entire map', () => {
    const { state, steps } = playToTheEnd(1, 3)

    expect(state.winnerId).not.toBeNull()
    expect(state.turn.phase).toBe('gameOver')
    expect(steps).toBeLessThan(40000)

    for (const each of Object.values(state.territories)) {
      expect(each.ownerId).toBe(state.winnerId)
    }
  })

  it('leaves every other player out of the game', () => {
    const { state } = playToTheEnd(1, 3)

    for (const player of state.players) {
      expect(player.isEliminated).toBe(player.id !== state.winnerId)
    }
  })

  it('finishes from many different starting boards', () => {
    for (const seed of [2, 3, 4, 5, 6, 7]) {
      const { state } = playToTheEnd(seed, 2 + (seed % 4))

      expect(state.winnerId, `seed ${seed}`).not.toBeNull()
    }
  })

  it('plays the same game twice from the same seed', () => {
    const first = playToTheEnd(99, 3)
    const second = playToTheEnd(99, 3)

    expect(first.state.winnerId).toBe(second.state.winnerId)
    expect(first.steps).toBe(second.steps)
    expect(first.state.log.length).toBe(second.state.log.length)
  })

  it('writes a log that reads like a game', () => {
    const { state } = playToTheEnd(1, 3)
    const words = state.log.map((entry) => entry.text).join(' ')

    expect(state.log.length).toBeGreaterThan(50)
    expect(words).toContain('attacks')
    expect(words).toContain('takes')
    expect(words).toContain('has won')
  })
})
