import { describe, expect, it } from 'vitest'

import { AUSTRALIA } from '../../maps/australia'
import { WORLD } from '../../maps/world'
import type { GameAction } from '../game'
import { applyAction, legalActions } from '../game'
import { seededRandom } from '../random'
import { DEFAULT_OPTIONS, createGame } from '../setup'
import type { GameMap, GameState } from '../types'
import { entrancesTo, frontierOf, interiorOf, regionHoldings } from './board'
import { GENERAL_SETTINGS, breakUrgency } from './general'
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

    expect(new Set(stories).size, 'two skills played identically').toBe(
      ALL_SKILLS.length,
    )
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

// ------------------------------------------- a plan needs room to matter

/**
 * A board shaped like a real Risk board: several regions of several
 * territories, joined by one door each.
 *
 * It exists because Australia is too small to tell two strategies apart.
 * With ten territories a region is two or three squares, so "I am going for
 * that region" is never more than one attack away and means almost nothing.
 */
function riskShapedMap(regions: number, per: number, bonus: number): GameMap {
  const name = (region: number, place: number) => `t${region}_${place}`
  const territories = []

  for (let region = 0; region < regions; region += 1) {
    for (let place = 0; place < per; place += 1) {
      const borders: string[] = []

      if (place > 0) borders.push(name(region, place - 1))
      if (place < per - 1) borders.push(name(region, place + 1))
      if (place === 0) {
        borders.push(name((region - 1 + regions) % regions, per - 1))
      }
      if (place === per - 1) borders.push(name((region + 1) % regions, 0))

      territories.push({
        id: name(region, place),
        name: name(region, place),
        shortName: name(region, place),
        regionId: `r${region}`,
        borders,
        shape: 'M 0 0 L 1 0 L 1 1 Z',
        labelAt: { x: place * 10 + 5, y: region * 10 + 5 },
      })
    }
  }

  return {
    id: 'risk-shaped',
    name: 'Risk shaped',
    viewBox: '0 0 500 500',
    regions: Array.from({ length: regions }, (_unused, region) => ({
      id: `r${region}`,
      name: `Region ${region}`,
      bonus,
      outline: '#000000',
    })),
    territories,
  }
}

function playOn(
  map: GameMap,
  order: readonly Skill[],
  seed: number,
  players: number,
): Skill | undefined {
  const random = seededRandom(seed)
  const choices = seededRandom(seed * 31 + 7)

  let state = createGame({
    map,
    players: Array.from({ length: players }, (_unused, index) => ({
      name: `p${index}`,
      kind: order[index % order.length] as Skill,
    })),
    random,
  })

  for (let step = 0; step < 60000 && state.winnerId === null; step += 1) {
    const kind = state.players.find(
      (each) => each.id === state.turn.playerId,
    )?.kind

    state = applyAction(
      state,
      playerFor(kind as Skill).chooseAction(state, choices),
      random,
    )
  }

  return state.players.find((each) => each.id === state.winnerId)?.kind as
    | Skill
    | undefined
}

describe('the Planner', () => {
  it('picks the region that pays most and is easiest to hold', () => {
    const state = createGame({
      map: AUSTRALIA,
      players: [
        { name: 'One', kind: 'planner' },
        { name: 'Two', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })

    // The West pays 3 and has two ways in. The South pays 2 and has five.
    // Any sensible plan prefers the first.
    expect(entrancesTo(state.map, 'west').length).toBeLessThan(
      entrancesTo(state.map, 'south').length,
    )
  })

  /**
   * The measurement that says a plan is worth having. Plan task 4.13.
   *
   * On Australia the Planner is level with Cautious, and no weighting
   * changed that: ten territories give a plan nothing to work with. On a
   * board shaped like a real Risk board it wins about six games in ten,
   * at every player count.
   *
   * So the finding is NOT "planning does not pay". It is "planning needs a
   * board worth planning on", which is why the map is being made bigger.
   */
  it('beats Cautious on a board with room to plan on', { timeout: 200000 }, () => {
    const board = riskShapedMap(6, 7, 5)
    let planner = 0
    let cautious = 0

    for (const players of [2, 4, 6]) {
      for (let game = 0; game < 24; game += 1) {
        const order: Skill[] =
          game % 2 === 0 ? ['planner', 'cautious'] : ['cautious', 'planner']
        const winner = playOn(board, order, game + 1, players)

        if (winner === 'planner') planner += 1
        else if (winner === 'cautious') cautious += 1
      }
    }

    expect(
      planner,
      `planner ${planner} : ${cautious} cautious on a 42-territory board`,
    ).toBeGreaterThan(cautious)
  })
})

// --------------------------------------------- the faults Nick named, 4.14

/**
 * Nick, after beating every computer player: "they always just leave one
 * army behind", "if another player has captured a continent they don't
 * seem to do anything about it", "not just all on one for a blitzkrieg
 * each time", and "behind it have at least more than one army". Each is a
 * test here, on a small ring of territories built for the purpose.
 */
describe('the General', () => {
  // Two regions of three, in a ring: t0_0 t0_1 t0_2 t1_0 t1_1 t1_2, and
  // back to t0_0.
  const ring = riskShapedMap(2, 3, 5)

  function onRing(
    owners: Record<string, [string, number]>,
    turn: Partial<GameState['turn']>,
  ): GameState {
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'general' },
        { name: 'Two', kind: 'cautious' },
        { name: 'Three', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    const territories: Record<string, { ownerId: string; armies: number }> = {}

    for (const [id, [ownerId, armies]] of Object.entries(owners)) {
      territories[id] = { ownerId, armies }
    }

    return {
      ...base,
      territories,
      turn: { ...base.turn, playerId: 'p1', armiesToPlace: 0, ...turn },
    }
  }

  it('leaves behind what the old territory still needs, not one army', () => {
    // t0_1 has just taken t0_2 and still faces five enemies in t0_0.
    const state = onRing(
      {
        t0_0: ['p2', 5],
        t0_1: ['p1', 9],
        t0_2: ['p1', 3],
        t1_0: ['p3', 1],
        t1_1: ['p3', 1],
        t1_2: ['p3', 1],
      },
      {
        phase: 'occupy',
        pendingOccupation: { fromId: 't0_1', toId: 't0_2', minimumArmies: 3, maximumArmies: 8 },
      },
    )
    const action = playerFor('general').chooseAction(state, seededRandom(1))
    const count = action.type === 'occupy' ? action.count : -1
    const leftBehind = 9 + 3 - count

    expect(leftBehind, `left ${leftBehind} facing 5`).toBeGreaterThanOrEqual(5)
  })

  it('attacks a continent somebody else holds before an easier target', () => {
    // Three holds all of region 1. t0_2 can hit t1_0, which breaks it, or
    // t0_1, which is weaker and breaks nothing.
    const state = onRing(
      {
        t0_0: ['p2', 3],
        t0_1: ['p2', 1],
        t0_2: ['p1', 12],
        t1_0: ['p3', 4],
        t1_1: ['p3', 2],
        t1_2: ['p3', 2],
      },
      { phase: 'attack', hasConquered: true },
    )
    const action = playerFor('general').chooseAction(state, seededRandom(1))

    expect(action.type === 'attack' ? action.toId : action.type).toBe('t1_0')
  })

  it('spreads its new armies over a weak front, not all on one', () => {
    let state = onRing(
      {
        t0_0: ['p1', 1],
        t0_1: ['p1', 1],
        t0_2: ['p1', 1],
        t1_0: ['p2', 4],
        t1_1: ['p2', 4],
        t1_2: ['p3', 4],
      },
      { phase: 'reinforce', armiesToPlace: 12 },
    )
    const random = seededRandom(3)

    while (state.turn.phase === 'reinforce' && state.turn.armiesToPlace > 0) {
      state = applyAction(state, playerFor('general').chooseAction(state, random), random)
    }

    const reinforced = ['t0_0', 't0_2'].filter(
      (id) => (state.territories[id]?.armies ?? 0) > 1,
    )

    // t0_0 and t0_2 both face four enemies. Both got armies.
    expect(reinforced, 'every weak spot on the front').toEqual(['t0_0', 't0_2'])
  })

  it('keeps more than one army on the line behind the front', () => {
    // A long line of our own land: t0_0 t0_1 t0_2 t1_0 t1_1, with the enemy
    // only in t1_2. t1_1 and t0_0 are the front, t0_1 and t1_0 are the line
    // behind it, and t0_2 is deep inside with armies to spare. The front is
    // already strong enough, t0_0 more so because it is a door into region
    // 0, which we hold whole.
    const state = onRing(
      {
        t0_0: ['p1', 8],
        t0_1: ['p1', 1],
        t0_2: ['p1', 9],
        t1_0: ['p1', 1],
        t1_1: ['p1', 6],
        t1_2: ['p2', 5],
      },
      { phase: 'fortify' },
    )
    const action = playerFor('general').chooseAction(state, seededRandom(1))

    expect(action.type).toBe('fortify')
    expect(action.type === 'fortify' ? ['t0_1', 't1_0'] : []).toContain(
      action.type === 'fortify' ? action.toId : '',
    )
  })
})

describe('the General, when there is nothing to attack with', () => {
  it('stops attacking rather than trying to fortify', () => {
    const ring = riskShapedMap(2, 3, 5)
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'general' },
        { name: 'Two', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    // Every territory of ours holds one army, so no attack is possible and
    // the only move on offer is to end the attack phase.
    const territories: Record<string, { ownerId: string; armies: number }> = {}

    for (const territory of ring.territories) {
      territories[territory.id] = {
        ownerId: territory.id.startsWith('t0') ? 'p1' : 'p2',
        armies: 1,
      }
    }

    const state: GameState = {
      ...base,
      territories,
      turn: { ...base.turn, playerId: 'p1', phase: 'attack', armiesToPlace: 0 },
    }

    expect(playerFor('general').chooseAction(state, seededRandom(1))).toEqual({
      type: 'endAttackPhase',
    })
  })
})

describe('the General is the strongest with a table full of players', () => {
  /**
   * Plan task 4.14. Measured 2026-09-11 on the world map, 120 games per
   * pairing, over seed ranges 5000, 20000 and 90000, none of which the
   * settings were chosen on:
   *
   * | General against | 2 players | 4 players |
   * |---|---|---|
   * | Greedy | 67 : 53 | 96 : 23 |
   * | Cautious | 85 : 35 | 101 : 18 |
   * | Planner | 70 : 50 | 87 : 33 |
   *
   * That is with its card first, no policing, and its duel settings once
   * one opponent is left (plan 4.15). With four at the table it wins about
   * eight games in ten; head to head it beats every other player. This checks the
   * four-player result on a slice of those games, against the Planner, the
   * strongest of the rest.
   */
  it('wins most four-player games on the world map', { timeout: 300000 }, () => {
    let general = 0
    let planner = 0

    for (const from of [5000, 20000]) {
      for (let game = 0; game < 12; game += 1) {
        const order: Skill[] =
          game % 2 === 0 ? ['general', 'planner'] : ['planner', 'general']
        const winner = playOn(WORLD, order, from + game, 4)

        if (winner === 'general') general += 1
        else if (winner === 'planner') planner += 1
      }
    }

    expect(general, `general ${general} : ${planner} planner`).toBeGreaterThan(
      planner * 1.3,
    )
  })
})

describe('the General takes its card first, and is not the policeman', () => {
  // The same ring of two regions of three: t0_0 t0_1 t0_2 t1_0 t1_1 t1_2.
  // Three players move in the order One, Two, Three.
  const ring = riskShapedMap(2, 3, 5)

  function board(
    owners: Record<string, [string, number]>,
    turn: Partial<GameState['turn']>,
  ): GameState {
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'general' },
        { name: 'Two', kind: 'cautious' },
        { name: 'Three', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    const territories: Record<string, { ownerId: string; armies: number }> = {}

    for (const [id, [ownerId, armies]] of Object.entries(owners)) {
      territories[id] = { ownerId, armies }
    }

    return {
      ...base,
      territories,
      turn: { ...base.turn, playerId: 'p1', armiesToPlace: 0, ...turn },
    }
  }

  /**
   * Nick: "General should still put a very high priority on gaining a card
   * every move." t0_2 can take t0_1, one army and worth nothing, or t1_0,
   * three armies and part of Three's whole continent.
   */
  const choice = {
    t0_0: ['p2', 1],
    t0_1: ['p2', 1],
    t0_2: ['p1', 6],
    t1_0: ['p3', 3],
    t1_1: ['p3', 2],
    t1_2: ['p3', 2],
  } as Record<string, [string, number]>

  it('takes the easy card before the valuable fight', () => {
    const state = board(choice, { phase: 'attack', hasConquered: false })
    const action = playerFor('general').chooseAction(state, seededRandom(1))

    expect(action.type === 'attack' ? action.toId : action.type).toBe('t0_1')
  })

  it('goes for the continent once the card is won', () => {
    const state = board(choice, { phase: 'attack', hasConquered: true })
    const action = playerFor('general').chooseAction(state, seededRandom(1))

    expect(action.type === 'attack' ? action.toId : action.type).toBe('t1_0')
  })

  /**
   * Nick: "perhaps it can reason that another player will take care of
   * that depending on play order." Three holds region 1. Two moves between
   * us and Three, so Two gets the first chance to break it, if Two has
   * armies beside it to do it with.
   */
  it('leaves a continent to a player who moves before its owner and can reach it', () => {
    const state = board(
      { ...choice, t0_0: ['p2', 5] },
      { phase: 'attack' },
    )

    expect(breakUrgency(state, 'p1', 'p3', 'r1')).toBe(GENERAL_SETTINGS.leaveItToOthers)
  })

  it('takes it on when that player has nothing to attack with', () => {
    const state = board(choice, { phase: 'attack' })

    expect(breakUrgency(state, 'p1', 'p3', 'r1')).toBe(1)
  })

  it('takes it on when the owner moves straight after us', () => {
    const state = board(
      {
        t0_0: ['p3', 5],
        t0_1: ['p3', 1],
        t0_2: ['p1', 6],
        t1_0: ['p2', 3],
        t1_1: ['p2', 2],
        t1_2: ['p2', 2],
      },
      { phase: 'attack' },
    )

    expect(breakUrgency(state, 'p1', 'p2', 'r1')).toBe(1)
  })
})

describe('the General changes its game when one opponent is left', () => {
  /**
   * Plan task 4.15. Nick: "It should also switch strategies then when the
   * other players get eliminated and it becomes 1 on 1."
   *
   * The same capture, twice. t0_1 has just taken t0_2 and now has no enemy
   * beside it: it is the line behind the front. With two enemies left it
   * keeps a second-line garrison. With one, armies there are armies that
   * never attack, so more of them move up.
   */
  function afterTheCapture(oneLeft: boolean): GameState {
    const ring = riskShapedMap(2, 3, 5)
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'general' },
        { name: 'Two', kind: 'cautious' },
        { name: 'Three', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    const lastEnemy = oneLeft ? 'p2' : 'p3'

    return {
      ...base,
      players: base.players.map((player) =>
        player.id === 'p3' && oneLeft ? { ...player, isEliminated: true } : player,
      ),
      territories: {
        t0_0: { ownerId: 'p1', armies: 4 },
        t0_1: { ownerId: 'p1', armies: 5 },
        t0_2: { ownerId: 'p1', armies: 3 },
        t1_0: { ownerId: 'p2', armies: 2 },
        t1_1: { ownerId: 'p2', armies: 2 },
        t1_2: { ownerId: lastEnemy, armies: 2 },
      },
      turn: {
        ...base.turn,
        playerId: 'p1',
        phase: 'occupy',
        armiesToPlace: 0,
        pendingOccupation: { fromId: 't0_1', toId: 't0_2', minimumArmies: 3, maximumArmies: 7 },
      },
    }
  }

  it('moves more armies up after a capture once it is one on one', () => {
    const general = playerFor('general')
    const moved = (state: GameState): number => {
      const action = general.chooseAction(state, seededRandom(1))

      return action.type === 'occupy' ? action.count : -1
    }

    expect(moved(afterTheCapture(true))).toBeGreaterThan(moved(afterTheCapture(false)))
  })
})

describe('a big turn is spread over the front first', () => {
  /**
   * Plan task 4.16. Nick: "When a CP gets hundreds of new armies they
   * shouldn't just dump in one place." One holds t0_0 t0_1 t0_2 with one
   * army each. t0_0 and t0_2 face the enemy; t0_1 is inland. A turn of 60
   * armies must leave both front territories stronger, whichever of them
   * the player's own plan chose for its stack.
   */
  for (const skill of ['cautious', 'turtle', 'counter', 'greedy', 'planner', 'general'] as const) {
    it(`${skill} boosts every front territory, not just its stack`, () => {
      const ring = riskShapedMap(2, 3, 5)
      const base = createGame({
        map: ring,
        players: [
          { name: 'One', kind: skill },
          { name: 'Two', kind: 'cautious' },
        ],
        random: seededRandom(1),
      })
      let state: GameState = {
        ...base,
        territories: {
          t0_0: { ownerId: 'p1', armies: 1 },
          t0_1: { ownerId: 'p1', armies: 1 },
          t0_2: { ownerId: 'p1', armies: 1 },
          t1_0: { ownerId: 'p2', armies: 20 },
          t1_1: { ownerId: 'p2', armies: 20 },
          t1_2: { ownerId: 'p2', armies: 20 },
        },
        turn: {
          ...base.turn,
          playerId: 'p1',
          phase: 'reinforce',
          armiesToPlace: 60,
          armiesGiven: 60,
        },
      }
      const random = seededRandom(2)

      while (state.turn.phase === 'reinforce' && state.turn.armiesToPlace > 0) {
        state = applyAction(state, playerFor(skill).chooseAction(state, random), random)
      }

      for (const id of ['t0_0', 't0_2']) {
        expect(state.territories[id]?.armies, `${skill} left ${id} thin`).toBeGreaterThan(5)
      }
    })
  }
})

describe('an ordinary turn is split too', () => {
  /**
   * Plan task 4.17. Nick: "make them all split ordinary turns too." The
   * same three territories as above, now with an ordinary turn of 10
   * armies. Both front territories must end the turn stronger.
   */
  for (const skill of ['cautious', 'turtle', 'counter', 'greedy', 'planner', 'general'] as const) {
    it(`${skill} puts armies on more than one front territory`, () => {
      const ring = riskShapedMap(2, 3, 5)
      const base = createGame({
        map: ring,
        players: [
          { name: 'One', kind: skill },
          { name: 'Two', kind: 'cautious' },
        ],
        random: seededRandom(1),
      })
      let state: GameState = {
        ...base,
        territories: {
          t0_0: { ownerId: 'p1', armies: 1 },
          t0_1: { ownerId: 'p1', armies: 1 },
          t0_2: { ownerId: 'p1', armies: 1 },
          t1_0: { ownerId: 'p2', armies: 3 },
          t1_1: { ownerId: 'p2', armies: 3 },
          t1_2: { ownerId: 'p2', armies: 3 },
        },
        turn: {
          ...base.turn,
          playerId: 'p1',
          phase: 'reinforce',
          armiesToPlace: 10,
          armiesGiven: 10,
        },
      }
      const random = seededRandom(2)

      while (state.turn.phase === 'reinforce' && state.turn.armiesToPlace > 0) {
        state = applyAction(state, playerFor(skill).chooseAction(state, random), random)
      }

      for (const id of ['t0_0', 't0_2']) {
        expect(state.territories[id]?.armies, `${skill} left ${id} at one`).toBeGreaterThan(1)
      }
    })
  }
})

describe('the Turtle', () => {
  /**
   * Plan tasks 4.23 and 4.24. The same ring of two regions of three. One is
   * the Turtle. The others together are far stronger, so it stays in its
   * shell.
   */
  const ring = riskShapedMap(2, 3, 5)

  function board(owners: Record<string, [string, number]>, hasConquered: boolean): GameState {
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'turtle' },
        { name: 'Two', kind: 'cautious' },
        { name: 'Three', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    const territories: Record<string, { ownerId: string; armies: number }> = {}

    for (const [id, [ownerId, armies]] of Object.entries(owners)) {
      territories[id] = { ownerId, armies }
    }

    return {
      ...base,
      territories,
      turn: { ...base.turn, playerId: 'p1', phase: 'attack', armiesToPlace: 0, hasConquered },
    }
  }

  function choice(state: GameState): string {
    const action = playerFor('turtle').chooseAction(state, seededRandom(1))

    return action.type === 'attack' ? action.toId : action.type
  }

  // Region 0 is the Turtle's shell, already built. t1_0 is weak but is not
  // Two's last territory unless the test says so.
  const inTheShell = (twoIsDownToOne: boolean): Record<string, [string, number]> => ({
    t0_0: ['p1', 6],
    t0_1: ['p1', 1],
    t0_2: ['p1', 6],
    t1_0: ['p2', 1],
    t1_1: [twoIsDownToOne ? 'p3' : 'p2', 9],
    t1_2: ['p3', 9],
  })

  it('attacks for its card', () => {
    expect(choice(board(inTheShell(false), false))).toBe('t1_0')
  })

  it('stops once the card is won', () => {
    expect(choice(board(inTheShell(false), true))).toBe('endAttackPhase')
  })

  it('still knocks a player out after the card is won', () => {
    expect(choice(board(inTheShell(true), true))).toBe('t1_0')
  })

  it('keeps pushing into the continent it is making its shell, after the card', () => {
    const building: Record<string, [string, number]> = {
      t0_0: ['p3', 9],
      t0_1: ['p2', 1],
      t0_2: ['p1', 6],
      t1_0: ['p3', 9],
      t1_1: ['p2', 9],
      t1_2: ['p3', 9],
    }

    expect(choice(board(building, true))).toBe('t0_1')
  })
})

describe('the Counter hits back', () => {
  /**
   * Plan task 4.28. The ring again. One is the Counter, on t0_2 with 6.
   * Two attacked it last turn from t1_0, which now holds 3. t0_1 holds a
   * single army of Three's, the easier capture.
   */
  const ring = riskShapedMap(2, 3, 5)

  function board(attackedBy: boolean, hasConquered: boolean): GameState {
    const base = createGame({
      map: ring,
      players: [
        { name: 'One', kind: 'counter' },
        { name: 'Two', kind: 'cautious' },
        { name: 'Three', kind: 'cautious' },
      ],
      random: seededRandom(1),
    })
    const owners: Record<string, [string, number]> = {
      t0_0: ['p3', 9],
      t0_1: ['p3', 1],
      t0_2: ['p1', 6],
      t1_0: ['p2', 3],
      t1_1: ['p2', 9],
      t1_2: ['p3', 9],
    }
    const territories: Record<string, { ownerId: string; armies: number }> = {}

    for (const [id, [ownerId, armies]] of Object.entries(owners)) {
      territories[id] = { ownerId, armies }
    }

    return {
      ...base,
      territories,
      recentFights: attackedBy
        ? [{ attackerId: 'p2', defenderId: 'p1', fromId: 't1_0', toId: 't0_2', taken: false }]
        : [],
      turn: { ...base.turn, playerId: 'p1', phase: 'attack', armiesToPlace: 0, hasConquered },
    }
  }

  function choice(state: GameState): string {
    const action = playerFor('counter').chooseAction(state, seededRandom(1))

    return action.type === 'attack' ? action.toId : action.type
  }

  it('hits the stack that attacked it before the easy card', () => {
    expect(choice(board(true, false))).toBe('t1_0')
  })

  it('still hits back once the card is won', () => {
    expect(choice(board(true, true))).toBe('t1_0')
  })

  it('makes no other attack once the card is won', () => {
    expect(choice(board(false, true))).toBe('endAttackPhase')
  })
})

describe('every player can play with many fortify moves', () => {
  // Plan task 4.24. With many moves, a player is asked again after each
  // move, so one that never ends its turn would hang the game.
  for (const skill of ALL_SKILLS) {
    it(`${skill} plays a game through to an end`, () => {
      const random = seededRandom(3)
      const choices = seededRandom(3 * 31 + 7)
      let state = createGame({
        map: AUSTRALIA,
        players: [
          { name: 'One', kind: skill },
          { name: 'Two', kind: 'greedy' },
        ],
        random,
        options: { ...DEFAULT_OPTIONS, fortifyMoves: 'many' },
      })

      for (let step = 0; step < 30000 && state.winnerId === null; step += 1) {
        const kind = state.players.find((each) => each.id === state.turn.playerId)?.kind

        state = applyAction(state, playerFor(kind as Skill).chooseAction(state, choices), random)
      }

      expect(state.winnerId, `${skill} never finished`).not.toBeNull()
    })
  }
})
