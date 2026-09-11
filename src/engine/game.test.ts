import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { STARTING_ARMIES } from './balance'
import { CAUTIOUS } from './players'
import { scriptedDice } from './dice'
import type { GameAction } from './game'
import {
  IllegalActionError,
  applyAction,
  armyLimitFor,
  legalActions,
} from './game'
import { fixedRandom, seededRandom } from './random'
import { DEFAULT_OPTIONS, createGame } from './setup'
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

// ---------------------------------------------------------- recent fights

describe('the fights each player made in their latest turn', () => {
  // Plan task 4.28. The Counter reads these to hit back.
  it('records an attack, who made it, and whether it took the place', () => {
    const state = gameWith(boardWhere({ wa: 5 }))
    const after = applyAction(
      state,
      { type: 'attack', fromId: 'wa', toId: 'nt' },
      scriptedDice([6, 5, 4, 1]),
    )

    expect(after.recentFights).toEqual([
      { attackerId: 'p1', defenderId: 'p2', fromId: 'wa', toId: 'nt', taken: true },
    ])
  })

  it("clears a player's old fights when their next turn starts, and keeps the rest", () => {
    const state = gameWith(
      boardWhere({ wa: 5 }),
      { phase: 'fortify' },
      {
        recentFights: [
          { attackerId: 'p1', defenderId: 'p2', fromId: 'wa', toId: 'nt', taken: false },
          { attackerId: 'p2', defenderId: 'p1', fromId: 'nt', toId: 'wa', taken: false },
        ],
      },
    )
    const after = applyAction(state, { type: 'skipFortify' }, NO_DICE)

    // Now it is p2's turn, so p2's old fight goes and p1's stays.
    expect(after.recentFights).toEqual([
      { attackerId: 'p1', defenderId: 'p2', fromId: 'wa', toId: 'nt', taken: false },
    ])
  })
})

// ---------------------------------------------------- many fortify moves

describe('many fortify moves', () => {
  // Plan task 4.24. Nick: "Add the multi-fortify option but default to
  // classic." Ann holds WA with 5, NT with 1 and SA with 4.
  const many = { ...DEFAULT_OPTIONS, fortifyMoves: 'many' as const }
  const start = (): GameState =>
    gameWith(boardWhere({ wa: 5, nt: 1, sa: 4 }), { phase: 'fortify' }, { options: many })

  it('is one move by default', () => {
    expect(DEFAULT_OPTIONS.fortifyMoves).toBe('one')
  })

  it('keeps the turn going after a move', () => {
    const after = applyAction(
      start(),
      { type: 'fortify', fromId: 'wa', toId: 'nt', count: 2 },
      NO_DICE,
    )

    expect(after.turn.playerId).toBe('p1')
    expect(after.turn.phase).toBe('fortify')
    expect(after.turn.hasFortified).toBe(true)
  })

  it('allows a second move from somewhere else', () => {
    let state = applyAction(
      start(),
      { type: 'fortify', fromId: 'wa', toId: 'nt', count: 2 },
      NO_DICE,
    )
    state = applyAction(state, { type: 'fortify', fromId: 'sa', toId: 'wa', count: 3 }, NO_DICE)

    expect(armiesOn(state, 'nt')).toBe(3)
    expect(armiesOn(state, 'wa')).toBe(6)
    expect(armiesOn(state, 'sa')).toBe(1)
  })

  it('keeps armies that arrived this turn where they are', () => {
    const state = applyAction(
      start(),
      { type: 'fortify', fromId: 'wa', toId: 'nt', count: 2 },
      NO_DICE,
    )

    expect(
      legalActions(state).some((each) => each.type === 'fortify' && each.fromId === 'nt'),
    ).toBe(false)
    expect(() =>
      applyAction(state, { type: 'fortify', fromId: 'nt', toId: 'sa', count: 1 }, NO_DICE),
    ).toThrow(/stay where they are/)
  })

  it('ends the turn when the player says so', () => {
    const moved = applyAction(
      start(),
      { type: 'fortify', fromId: 'wa', toId: 'nt', count: 2 },
      NO_DICE,
    )
    const after = applyAction(moved, { type: 'skipFortify' }, NO_DICE)

    expect(after.turn.playerId).toBe('p2')
    expect(after.turn.movedInto).toBeUndefined()
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

function playToTheEnd(
  seed: number,
  playerCount: number,
): { readonly state: GameState; readonly steps: number } {
  const random = seededRandom(seed)
  const choices = seededRandom(seed + 1000)

  let state = createGame({
    map: AUSTRALIA,
    players: Array.from({ length: playerCount }, (_unused, index) => ({
      name: `Player ${index + 1}`,
      kind: 'cautious' as const,
    })),
    random,
  })

  let steps = 0

  while (state.winnerId === null && steps < 40000) {
    state = applyAction(state, CAUTIOUS.chooseAction(state, choices), random)
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

// ------------------------------------------------- placing armies by hand

describe('the setup phase', () => {
  function byHand(playerCount = 3): GameState {
    return createGame({
      map: AUSTRALIA,
      players: Array.from({ length: playerCount }, (_u, index) => ({
        name: `Player ${index + 1}`,
        kind: 'human' as const,
      })),
      random: seededRandom(1),
      options: { ...DEFAULT_OPTIONS, armyPlacement: 'byHand' },
    })
  }

  /** The first territory the player whose turn it is may place on. */
  function anywhereMine(state: GameState): GameAction {
    const first = legalActions(state)[0]

    if (first === undefined) {
      throw new Error('There is nowhere to place an army.')
    }

    return first
  }

  it('offers only your own territories, one army at a time', () => {
    const state = byHand()
    const actions = legalActions(state)

    expect(actions.length).toBeGreaterThan(0)

    for (const action of actions) {
      expect(action.type).toBe('placeArmies')

      if (action.type === 'placeArmies') {
        expect(action.count).toBe(1)
        expect(state.territories[action.territoryId]?.ownerId).toBe(
          state.turn.playerId,
        )
      }
    }
  })

  // Alternating is the point. It lets each player answer where the others
  // are building up, which is the first real decision of a game.
  it('passes to the next player after every single army', () => {
    const state = byHand()
    const after = applyAction(state, anywhereMine(state), NO_DICE)

    expect(after.turn.playerId).toBe('p2')
    expect(after.turn.phase).toBe('setup')
  })

  it('takes the army out of that player hand and puts it on the board', () => {
    const state = byHand()
    const action = anywhereMine(state)
    const before = state.players[0]?.reserve ?? 0
    const after = applyAction(state, action, NO_DICE)

    expect(after.players[0]?.reserve).toBe(before - 1)

    if (action.type === 'placeArmies') {
      expect(armiesOn(after, action.territoryId)).toBe(2)
    }
  })

  it('refuses more than one army at a time', () => {
    const state = byHand()
    const owned = legalActions(state)[0]

    if (owned?.type === 'placeArmies') {
      expect(() =>
        applyAction(state, { ...owned, count: 3 }, NO_DICE),
      ).toThrow(/one at a time/)
    }
  })

  it('refuses a territory somebody else owns', () => {
    const state = byHand()
    const theirs = Object.keys(state.territories).find(
      (id) => state.territories[id]?.ownerId !== state.turn.playerId,
    )

    expect(() =>
      applyAction(
        state,
        { type: 'placeArmies', territoryId: theirs as string, count: 1 },
        NO_DICE,
      ),
    ).toThrow(/does not own/)
  })

  it('refuses attacking before every army is down', () => {
    const state = byHand()

    expect(() =>
      applyAction(state, { type: 'attack', fromId: 'wa', toId: 'nt' }, NO_DICE),
    ).toThrow()
  })

  it('starts the real game once every army is placed', () => {
    let state = byHand()
    let steps = 0

    while (state.turn.phase === 'setup' && steps < 500) {
      state = applyAction(state, anywhereMine(state), NO_DICE)
      steps += 1
    }

    expect(state.turn.phase).toBe('reinforce')
    expect(state.turn.playerId).toBe('p1')
    expect(state.turn.armiesToPlace).toBeGreaterThanOrEqual(3)

    for (const player of state.players) {
      expect(player.reserve).toBe(0)
    }
  })

  it('places exactly the armies the players were given', () => {
    let state = byHand()
    const armiesEach = STARTING_ARMIES[3] as number
    let steps = 0

    while (state.turn.phase === 'setup' && steps < 500) {
      state = applyAction(state, anywhereMine(state), NO_DICE)
      steps += 1
    }

    for (const player of state.players) {
      const onBoard = Object.values(state.territories)
        .filter((each) => each.ownerId === player.id)
        .reduce((total, each) => total + each.armies, 0)

      expect(onBoard).toBe(armiesEach)
    }
  })

  it('skips a player who runs out before the others', () => {
    // With 3 players on 10 territories one player holds 4 territories, so
    // that player starts with one army fewer in hand than the other two.
    // Everyone must still finish, and nobody may place after they run out.
    let state = byHand()
    let steps = 0

    while (state.turn.phase === 'setup' && steps < 500) {
      const player = state.players.find(
        (each) => each.id === state.turn.playerId,
      )

      expect(player?.reserve, 'a player with nothing in hand got a turn')
        .toBeGreaterThan(0)

      state = applyAction(state, anywhereMine(state), NO_DICE)
      steps += 1
    }

    expect(state.turn.phase).toBe('reinforce')
  })

  it('says in the log when play begins', () => {
    let state = byHand()
    let steps = 0

    while (state.turn.phase === 'setup' && steps < 500) {
      state = applyAction(state, anywhereMine(state), NO_DICE)
      steps += 1
    }

    expect(state.log.map((entry) => entry.text).join(' ')).toContain(
      'Play begins',
    )
  })
})
