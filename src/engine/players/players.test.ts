import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../../maps/australia'
import type { GameAction } from '../game'
import { applyAction, legalActions } from '../game'
import { seededRandom } from '../random'
import { createGame } from '../setup'
import type { GameState } from '../types'
import { frontierOf, interiorOf, regionHoldings } from './board'
import { ALL_SKILLS, playerFor } from './index'
import type { Skill } from './types'

interface MatchResult {
  readonly winner: Skill | null
  readonly rounds: number
  readonly steps: number
  readonly state: GameState
}

/** Play one whole game between the given players, in the given order. */
function playMatch(skills: readonly Skill[], seed: number): MatchResult {
  const random = seededRandom(seed)
  const choices = seededRandom(seed * 31 + 7)

  let state = createGame({
    map: AUSTRALIA,
    players: skills.map((skill, index) => ({
      name: `${skill} ${index + 1}`,
      kind: skill,
    })),
    random,
  })

  let steps = 0

  while (state.winnerId === null && steps < 30000) {
    const kind = state.players.find(
      (each) => each.id === state.turn.playerId,
    )?.kind

    state = applyAction(
      state,
      playerFor(kind as Skill).chooseAction(state, choices),
      random,
    )
    steps += 1
  }

  const winner = state.players.find((each) => each.id === state.winnerId)?.kind

  return {
    winner: (winner as Skill | undefined) ?? null,
    rounds: state.round,
    steps,
    state,
  }
}

/**
 * Play many games between two players.
 *
 * Who moves first ALTERNATES. Moving first in Conquest is worth something,
 * so a match where one side always started would measure the seat as much
 * as the player.
 */
function tournament(
  first: Skill,
  second: Skill,
  games: number,
  from = 1,
) {
  let firstWins = 0
  let secondWins = 0
  let unfinished = 0
  let longest = 0

  for (let game = 0; game < games; game += 1) {
    const order = game % 2 === 0 ? [first, second] : [second, first]
    const result = playMatch(order, from + game)

    longest = Math.max(longest, result.rounds)

    if (result.winner === first) {
      firstWins += 1
    } else if (result.winner === second) {
      secondWins += 1
    } else {
      unfinished += 1
    }
  }

  return { firstWins, secondWins, unfinished, longest }
}

// --------------------------------------------------- everyone plays legally

describe('every player obeys the rules', () => {
  // A computer player may only return something legalActions offered. This
  // is the guarantee that makes a computer player safe: it cannot cheat,
  // because it never sees the rules, only the list of what is allowed.
  for (const skill of ALL_SKILLS) {
    it(`${skill} only ever returns an action the engine allows`, () => {
      const random = seededRandom(7)
      const choices = seededRandom(99)
      const player = playerFor(skill)

      let state = createGame({
        map: AUSTRALIA,
        players: [
          { name: 'One', kind: skill },
          { name: 'Two', kind: skill },
          { name: 'Three', kind: skill },
        ],
        random,
      })

      for (let step = 0; step < 600 && state.winnerId === null; step += 1) {
        const action = player.chooseAction(state, choices)
        const allowed = legalActions(state)

        expect(
          allowed.some((each) => sameShape(each, action)),
          `${skill} returned ${JSON.stringify(action)}`,
        ).toBe(true)

        state = applyAction(state, action, random)
      }
    })
  }

  // Every player must be able to play a game THROUGH to an end. Greedy is
  // the opponent because it presses, so a game only fails to finish if the
  // other player is refusing to play rather than merely playing badly.
  //
  // Two Reckless players against each other are NOT required to finish.
  // Random play wanders, and 30000 moves was not enough for one seed. That
  // is a fact about random play, and part of why it is the baseline.
  for (const skill of ALL_SKILLS) {
    it(`${skill} plays a game through to an end`, () => {
      const result = playMatch([skill, 'greedy'], 3)

      expect(result.winner, `${skill} never finished a game`).not.toBeNull()
    })
  }
})

/** The same move, ignoring how many armies it carries. */
function sameShape(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type) {
    return false
  }

  if (left.type === 'placeArmies' && right.type === 'placeArmies') {
    return left.territoryId === right.territoryId
  }

  if (
    (left.type === 'attack' && right.type === 'attack') ||
    (left.type === 'fortify' && right.type === 'fortify')
  ) {
    return (
      left.fromId === (right as typeof left).fromId &&
      left.toId === (right as typeof left).toId
    )
  }

  return true
}

// ------------------------------------------- the three faults Nick spotted

describe('the faults Nick named while watching the phase 2 player', () => {
  function afterOneTurn(skill: Skill, seed: number): GameState {
    const random = seededRandom(seed)
    const choices = seededRandom(seed + 500)
    const player = playerFor(skill)

    let state = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'One', kind: skill },
        { name: 'Two', kind: skill },
      ],
      random,
    })

    for (let step = 0; step < 300 && state.winnerId === null; step += 1) {
      state = applyAction(state, player.chooseAction(state, choices), random)
    }

    return state
  }

  // Fault 2: hoarding. Armies buried inside your own land can never fight.
  for (const skill of ['cautious', 'greedy'] as const) {
    it(`${skill} does not bury its armies inland`, () => {
      const state = afterOneTurn(skill, 11)

      for (const player of state.players) {
        const inside = interiorOf(state, player.id)
        const edge = frontierOf(state, player.id)

        if (inside.length === 0 || edge.length === 0) {
          continue
        }

        const biggestInside = Math.max(
          ...inside.map((id) => state.territories[id]?.armies ?? 0),
        )
        const biggestOnEdge = Math.max(
          ...edge.map((id) => state.territories[id]?.armies ?? 0),
        )

        expect(
          biggestInside,
          `${player.name} left ${biggestInside} armies where they cannot fight`,
        ).toBeLessThanOrEqual(biggestOnEdge)
      }
    })
  }

  // Fault 1: too hesitant. A player that never attacks never wins.
  it('reckless attacks, and so do the other two', () => {
    for (const skill of ALL_SKILLS) {
      const state = afterOneTurn(skill, 5)
      const attacks = state.log.filter((entry) =>
        entry.text.includes(' attacks '),
      ).length

      expect(attacks, `${skill} never attacked anybody`).toBeGreaterThan(0)
    }
  })

  // Fault 3: every player the same. If two skills play the same moves, the
  // choice between them means nothing.
  it('the three do not play the same game', () => {
    const games = ALL_SKILLS.map((skill) => afterOneTurn(skill, 21))
    const stories = games.map((state) =>
      state.log.map((entry) => entry.text).join('|'),
    )

    expect(new Set(stories).size, 'two skills played identically').toBe(3)
  })
})

// --------------------------------------------------- greedy plays for regions

describe('greedy plays for the regions', () => {
  it('finishes a region rather than taking any old territory', () => {
    // Give Greedy every territory of The West except Rottnest Island, and
    // a spare army beside both Rottnest and somewhere worth nothing.
    const board: Record<string, { ownerId: string; armies: number }> = {}

    for (const each of AUSTRALIA.territories) {
      board[each.id] = { ownerId: 'p2', armies: 1 }
    }

    for (const id of ['wa', 'nt']) {
      board[id] = { ownerId: 'p1', armies: 8 }
    }

    const base = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'One', kind: 'greedy' },
        { name: 'Two', kind: 'greedy' },
      ],
      random: seededRandom(1),
    })

    const state: GameState = {
      ...base,
      territories: board,
      turn: { ...base.turn, playerId: 'p1', phase: 'attack', armiesToPlace: 0 },
    }

    // The West is Western Australia, Rottnest Island and the Northern
    // Territory. Two of the three are held, so Rottnest is the whole bonus.
    const holding = regionHoldings(state, 'p1').find(
      (each) => each.regionId === 'west',
    )

    expect(holding?.missing).toEqual(['rot'])

    const action = playerFor('greedy').chooseAction(state, seededRandom(2))

    expect(action.type).toBe('attack')
    expect(action.type === 'attack' ? action.toId : '').toBe('rot')
  })
})

// ------------------------------------------------------------ plan task 4.6

describe('the players are ranked, not just different', () => {
  it('greedy beats reckless over 100 games', { timeout: 120000 }, () => {
    const scores = tournament('greedy', 'reckless', 100)

    // The point of this test is that it turns "is this any good?" into a
    // number. If Greedy ever stops winning most of these, something real
    // has broken, whatever the other tests say.
    expect(scores.unfinished, 'games that never ended').toBe(0)
    expect(scores.firstWins + scores.secondWins).toBe(100)
    expect(scores.firstWins, `greedy ${scores.firstWins} : ${scores.secondWins} reckless`)
      .toBeGreaterThan(75)
  })

  it('cautious beats reckless over 40 games', { timeout: 120000 }, () => {
    const scores = tournament('cautious', 'reckless', 40)

    expect(
      scores.firstWins,
      `cautious ${scores.firstWins} : ${scores.secondWins} reckless`,
    ).toBeGreaterThan(25)
  })

  // The one that says the region idea was worth building. If Greedy cannot
  // beat Cautious, everything in greedy.ts is decoration.
  /**
   * Greedy is NOT better than Cautious, and this test says so.
   *
   * Measured over 200 games on 2026-09-07: greedy 94, cautious 100, and 6
   * games that never finished. That is a coin flip. An earlier 40-game run
   * came out 21 to 19 and would have let a claim of "Greedy is the hardest"
   * through, which is why the number of games matters as much as the test.
   *
   * So this checks what is true rather than what was hoped for: the two are
   * evenly matched, and neither collapses. If one ever starts winning three
   * games in four, something changed and somebody should know why.
   */
  it('greedy and cautious are evenly matched', { timeout: 200000 }, () => {
    // FOUR SEPARATE SEED RANGES, not one long run.
    //
    // This test was fooled once. A rule tuned on seeds 1 to 200 scored
    // 108 to 88 and looked like a real improvement. On seeds 5000, 20000
    // and 90000 it scored 93-107, 97-102 and 103-96. Across all four it
    // was 401 to 393, which is a coin flip. The first range had been used
    // to CHOOSE the rule, so of course the rule did well on it.
    let greedy = 0
    let cautious = 0

    for (const from of [1, 5000, 20000, 90000]) {
      const scores = tournament('greedy', 'cautious', 50, from)
      greedy += scores.firstWins
      cautious += scores.secondWins
    }

    const decided = greedy + cautious
    const report = `greedy ${greedy} : ${cautious} cautious`

    expect(decided, 'too many games never finished').toBeGreaterThan(180)
    expect(greedy / decided, report).toBeGreaterThan(0.35)
    expect(greedy / decided, report).toBeLessThan(0.65)
  })

  /**
   * Games finish. This is the guard for plan task 4.8.
   *
   * Greedy once demanded a two-to-one advantage before attacking, which is
   * published Risk advice and is right on a full board. On ten territories
   * it is paralysing: two such players deadlocked 31 games out of 60, one
   * running to round 1796 with a territory holding 1,337,626 armies.
   *
   * Reckless against Reckless is left out. Random play wanders, and that is
   * a fact about random play rather than a fault to guard against.
   */
  it('no two thinking players deadlock', { timeout: 200000 }, () => {
    for (const first of ['cautious', 'greedy'] as const) {
      for (const second of ['cautious', 'greedy'] as const) {
        const scores = tournament(first, second, 30)

        expect(
          scores.unfinished,
          `${first} vs ${second} left ${scores.unfinished} of 30 unfinished`,
        ).toBeLessThanOrEqual(2)
      }
    }
  })

  /**
   * The same board must not play out the same way twice.
   *
   * Nick's point, and it matters more than the win rate: a player that
   * always takes the single best move plays an identical game every time.
   * That is dull to play against and easy to learn.
   *
   * So the dice are held FIXED here and only the player's own choices
   * vary. Any difference in the story is the player choosing differently,
   * not the dice falling differently.
   */
  it('does not play the same game twice on the same board', () => {
    const stories = new Set<string>()

    for (const chooserSeed of [1, 2, 3, 4, 5]) {
      const dice = seededRandom(77)
      const choices = seededRandom(chooserSeed)

      let state = createGame({
        map: AUSTRALIA,
        players: [
          { name: 'One', kind: 'cautious' },
          { name: 'Two', kind: 'cautious' },
        ],
        random: seededRandom(77),
      })

      for (let step = 0; step < 120 && state.winnerId === null; step += 1) {
        state = applyAction(
          state,
          playerFor('cautious').chooseAction(state, choices),
          dice,
        )
      }

      stories.add(state.log.map((entry) => entry.text).join('|'))
    }

    expect(stories.size, 'the same board played out identically').toBe(5)
  })

  it('a good player beats a bad one quickly', () => {
    const easy = tournament('greedy', 'reckless', 20)

    expect(easy.longest, 'greedy vs reckless dragged').toBeLessThan(60)
    expect(easy.firstWins).toBeGreaterThan(15)
  })
})
