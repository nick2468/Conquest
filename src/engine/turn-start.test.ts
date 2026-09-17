import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import { WORLD } from '../maps/world'
import { MINIMUM_REINFORCEMENTS, TERRITORIES_PER_ARMY } from './balance'
import { applyAction } from './game'
import { playerFor } from './players'
import { seededRandom } from './random'
import { whereArmiesCameFrom } from './reinforce'
import { createGame } from './setup'
import type { GameMap, GameState, PlayerId } from './types'

/**
 * The armies a player is handed when their turn begins. Plan task 4.56.
 *
 * Nick: "check that continent bonuses are being applied at the start of the
 * turn." `reinforce.test.ts` checks the SUM. Nothing checked that the game
 * actually hands that sum over when a turn begins, and that is the question.
 *
 * So these tests play whole games and stop at the start of every turn. The
 * answer is worked out HERE, from the board, rather than by calling
 * `reinforcementsFor`: a test that asks the function to check itself proves
 * nothing.
 */

/** What the rules say this player should be given, worked out by hand. */
function owed(state: GameState, playerId: PlayerId): { total: number; bonus: number } {
  const owned = new Set(
    Object.keys(state.territories).filter(
      (id) => state.territories[id]?.ownerId === playerId,
    ),
  )

  let bonus = 0

  for (const region of state.map.regions) {
    const inside = state.map.territories.filter(
      (each) => each.regionId === region.id,
    )

    if (inside.length > 0 && inside.every((each) => owned.has(each.id))) {
      bonus += region.bonus
    }
  }

  const fromLand = Math.max(
    MINIMUM_REINFORCEMENTS,
    Math.floor(owned.size / TERRITORIES_PER_ARMY),
  )

  return { total: fromLand + bonus, bonus }
}

/**
 * Play games, and at the start of every turn compare what was given with
 * what is owed. Answers how many turn starts were checked, and how many of
 * those carried a region bonus, so a test can prove the case was reached.
 */
function everyTurnStart(
  map: GameMap,
  kinds: readonly string[],
  seeds: readonly number[],
): { checked: number; withBonus: number; wrong: string[] } {
  let checked = 0
  let withBonus = 0
  const wrong: string[] = []

  for (const seed of seeds) {
    const random = seededRandom(seed)
    const choices = seededRandom(seed * 31 + 7)

    let state = createGame({
      map,
      players: kinds.map((kind, at) => ({ name: `p${at}`, kind: kind as 'optimus' })),
      random,
    })

    // The very first turn is handed out by setup rather than by the end of
    // a turn, which is a separate path and worth checking too.
    const look = (board: GameState): void => {
      if (board.turn.phase !== 'reinforce' || board.winnerId !== null) return

      const should = owed(board, board.turn.playerId)
      const given = board.turn.armiesGiven ?? board.turn.armiesToPlace

      checked += 1
      if (should.bonus > 0) withBonus += 1

      // What the turn RECORDED about where they came from must add up to
      // what was given, and name the same regions. Plan task 4.56.
      const said = whereArmiesCameFrom(board.map, board.turn)
      const saidTotal = said.reduce((total, each) => total + each.armies, 0)
      const saidBonus = said.slice(1).reduce((total, each) => total + each.armies, 0)

      if (saidTotal !== given || saidBonus !== should.bonus) {
        wrong.push(
          `seed ${seed} round ${board.round}: breakdown says ${saidTotal} ` +
            `(bonus ${saidBonus}), given ${given} (bonus ${should.bonus})`,
        )
      }

      if (given !== should.total) {
        wrong.push(
          `seed ${seed} round ${board.round}: ${board.turn.playerId} given ${given}, ` +
            `owed ${should.total} (bonus ${should.bonus})`,
        )
      }
    }

    look(state)

    for (let step = 0; step < 40000 && state.winnerId === null; step += 1) {
      const before = state.turn.playerId
      const kind = state.players.find((each) => each.id === before)?.kind

      state = applyAction(
        state,
        playerFor(kind as 'optimus').chooseAction(state, choices),
        random,
      )

      // A new player's turn has just begun: nothing has been traded or
      // placed yet, so what they were given is exactly what they are owed.
      if (state.turn.playerId !== before) {
        look(state)
      }
    }
  }

  return { checked, withBonus, wrong }
}

/**
 * How long a whole-game check may take. These play a dozen full games each,
 * about three seconds on a quiet machine, which is too close to the usual
 * five-second limit: they failed twice while a tournament was running.
 */
const WHOLE_GAMES = 30_000

describe('a region bonus is handed over when a turn begins', () => {
  const seeds = Array.from({ length: 12 }, (_, at) => 100 + at)

  for (const [name, map, kinds] of [
    ['the world', WORLD, ['optimus', 'turtle', 'general', 'planner']],
    ['Australia in detail', AUSTRALIA_BIG, ['optimus', 'turtle', 'planner']],
    ['Australia', AUSTRALIA, ['optimus', 'general', 'greedy']],
  ] as const) {
    it(`on ${name}, at every turn start`, () => {
      const result = everyTurnStart(map, kinds, seeds)

      expect(result.wrong).toEqual([])
      expect(result.checked).toBeGreaterThan(100)
      // Proof the case was really reached. A test that never saw a bonus
      // would pass whether bonuses worked or not.
      expect(result.withBonus).toBeGreaterThan(20)
    }, WHOLE_GAMES)
  }
})

describe('the bonus is the one the map declares', () => {
  it('gives exactly the region bonus to a player who holds just that region', () => {
    const state = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'One', kind: 'optimus' },
        { name: 'Two', kind: 'optimus' },
      ],
      random: seededRandom(3),
    })

    const one = state.players[0]?.id as string
    const two = state.players[1]?.id as string
    const region = AUSTRALIA.regions[0]!
    const inside = new Set(
      AUSTRALIA.territories
        .filter((each) => each.regionId === region.id)
        .map((each) => each.id),
    )

    // One holds that region and nothing else. Two holds everything else.
    const board = Object.fromEntries(
      AUSTRALIA.territories.map((each) => [
        each.id,
        { ownerId: inside.has(each.id) ? one : two, armies: 1 },
      ]),
    )

    const held: GameState = { ...state, territories: board }

    expect(owed(held, one).bonus).toBe(region.bonus)
    expect(owed(held, one).total).toBe(
      Math.max(MINIMUM_REINFORCEMENTS, Math.floor(inside.size / TERRITORIES_PER_ARMY)) +
        region.bonus,
    )
  })
})

describe('where the armies came from', () => {
  const map = AUSTRALIA

  it('lists the land first, then each region held', () => {
    const said = whereArmiesCameFrom(map, {
      armiesToPlace: 8,
      armiesGiven: 8,
      armiesForLand: 3,
      territoriesHeld: 7,
      regionsHeld: ['west', 'south'],
    })

    expect(said).toEqual([
      { label: '7 territories', armies: 3 },
      { label: 'The West', armies: 3 },
      { label: 'The South', armies: 2 },
    ])
  })

  it('adds a line for cards once a set has been traded', () => {
    // Three for the land, three for the West, and a set worth six.
    const said = whereArmiesCameFrom(map, {
      armiesToPlace: 12,
      armiesGiven: 12,
      armiesForLand: 3,
      territoriesHeld: 7,
      regionsHeld: ['west'],
    })

    expect(said.at(-1)).toEqual({ label: 'Cards', armies: 6 })
    expect(said.reduce((total, each) => total + each.armies, 0)).toBe(12)
  })

  it('says nothing for a turn that never recorded it', () => {
    // A game from before this existed. Guessing from today's board could
    // be wrong, so it does not guess.
    expect(whereArmiesCameFrom(map, { armiesToPlace: 5 })).toEqual([])
  })

  it('records it on the very first turn of a game', () => {
    const state = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'One', kind: 'optimus' },
        { name: 'Two', kind: 'optimus' },
      ],
      random: seededRandom(9),
    })

    const said = whereArmiesCameFrom(state.map, state.turn)

    expect(said.length).toBeGreaterThan(0)
    expect(said.reduce((total, each) => total + each.armies, 0)).toBe(
      state.turn.armiesToPlace,
    )
  })
})
