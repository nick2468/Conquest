import type { GameAction, GameMap, Point, TerritoryId } from '../engine'
import { middleOf, middleOfMap } from './zoom'

/**
 * What to draw over the map when something happens. Plan task 7.2.
 *
 * Nick asked to SEE a move, not only read it: smoke on the border during an
 * attack, landing craft arriving at an island, parachutists inland, a
 * convoy when armies move.
 *
 * This file works all of that out from the map and one action. It touches
 * no browser, no clock and no React, so it is tested exactly like the
 * rules are. The screen draws whatever comes back. See spec S23.
 *
 * The game never waits for any of it. See spec S24.
 */

export type EffectKind = 'battle' | 'landing' | 'parachute' | 'convoy'

export interface Effect {
  readonly kind: EffectKind
  /** Where it happens, in map coordinates. */
  readonly at: Point
  /**
   * Where a convoy sets out from. Null for anything that stays put.
   */
  readonly from: Point | null
  /**
   * Which way landing craft come in from, as a direction of length 1.
   *
   * A distance is deliberately NOT given. How far off the coast to start
   * them depends on how far the map is zoomed, and this file does not know
   * that. The drawing decides the distance so the boats are always on
   * screen. Null for anything that does not arrive from somewhere.
   */
  readonly comingFrom: Point | null
  /** How long it runs, in milliseconds. */
  readonly lasting: number
}

/**
 * How long each one runs.
 *
 * These are matched to the pauses a computer player takes between its
 * moves, in App.tsx: 700 milliseconds for an ordinary move and 1500 after a
 * fight. An effect that outlived its pause would be cut off half way
 * through by the next one, which looks like a fault rather than a fight.
 */
const LASTS: Readonly<Record<EffectKind, number>> = {
  battle: 1400,
  landing: 700,
  parachute: 700,
  convoy: 700,
}

function placeIn(map: GameMap, territoryId: TerritoryId) {
  return map.territories.find((each) => each.id === territoryId)
}

/** Halfway between two places, which is near enough to the border. */
function between(one: Point, two: Point): Point {
  return { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 }
}

/**
 * Is moving between these two places a sea crossing?
 *
 * It is when exactly ONE end is an island. Melbourne to Launceston crosses
 * Bass Strait. Launceston to Hobart does not, because both are on the same
 * island. Perth to Rottnest does, and Sydney to Melbourne does not.
 *
 * Armies may fortify any distance through their own land, so the two ends
 * can be a long way apart. The rule still holds: if one end is an island
 * and the other is not, water is crossed somewhere on the way.
 */
export function crossesWater(
  map: GameMap,
  fromId: TerritoryId,
  toId: TerritoryId,
): boolean {
  const from = placeIn(map, fromId)?.isIsland === true
  const to = placeIn(map, toId)?.isIsland === true

  return from !== to
}

/** A direction of length 1 from one point to another. */
function directionFrom(at: Point, towards: Point): Point | null {
  const x = towards.x - at.x
  const y = towards.y - at.y
  const length = Math.hypot(x, y)

  if (length === 0) {
    return null
  }

  return { x: x / length, y: y / length }
}

/**
 * Which way the open sea lies from a place, as a direction of length 1.
 *
 * Straight out from the middle of the board. That is right for every island
 * we have: Rottnest is approached from the west, the Whitsundays from the
 * east, Tasmania from the south. It is a rule about the shape of a country,
 * not a guess: an island sits outside the mainland, so the sea beside it is
 * the side facing away from the middle.
 */
export function towardsTheSea(map: GameMap, at: Point): Point {
  const centre = middleOfMap(map)
  const x = at.x - centre.x
  const y = at.y - centre.y
  const length = Math.hypot(x, y)

  if (length === 0) {
    return { x: 0, y: 1 }
  }

  return { x: x / length, y: y / length }
}

/**
 * What to draw for one action, or null for an action with nothing to show.
 *
 * Trading cards, ending the attacks and skipping a fortify all change
 * numbers and nothing else, so they get nothing.
 *
 * Taking over a territory after winning gets nothing either. The fight that
 * won it has only just finished on the same spot, and a convoy on top of
 * the smoke reads as a second, separate move.
 */
export function effectFor(map: GameMap, action: GameAction): Effect | null {
  if (action.type === 'attack') {
    const from = placeIn(map, action.fromId)
    const to = placeIn(map, action.toId)

    if (from === undefined || to === undefined) {
      return null
    }

    return {
      kind: 'battle',
      at: between(middleOf(from), middleOf(to)),
      from: null,
      comingFrom: null,
      lasting: LASTS.battle,
    }
  }

  if (action.type === 'placeArmies') {
    const place = placeIn(map, action.territoryId)

    if (place === undefined) {
      return null
    }

    const at = middleOf(place)

    if (place.isIsland === true) {
      return {
        kind: 'landing',
        at,
        from: null,
        comingFrom: towardsTheSea(map, at),
        lasting: LASTS.landing,
      }
    }

    return {
      kind: 'parachute',
      at,
      from: null,
      comingFrom: null,
      lasting: LASTS.parachute,
    }
  }

  if (action.type === 'fortify') {
    const from = placeIn(map, action.fromId)
    const to = placeIn(map, action.toId)

    if (from === undefined || to === undefined) {
      return null
    }

    const start = middleOf(from)
    const end = middleOf(to)

    // Lorries cannot drive across Bass Strait. Armies that cross water go
    // the same way armies arriving at an island do, by boat.
    if (crossesWater(map, action.fromId, action.toId)) {
      return {
        kind: 'landing',
        at: end,
        from: null,
        comingFrom: directionFrom(end, start) ?? towardsTheSea(map, end),
        lasting: LASTS.landing,
      }
    }

    return {
      kind: 'convoy',
      at: end,
      from: start,
      comingFrom: null,
      lasting: LASTS.convoy,
    }
  }

  return null
}
