import type { GameAction, GameState, RandomSource } from '../index'
import { armyLimitFor, legalActions } from '../index'

/**
 * A player just good enough to finish a game.
 *
 * FOR TESTS ONLY. The app never imports it. The real computer players are
 * plan phase 4, which replaces this with something that can be measured
 * against itself.
 *
 * It lives here, rather than inside one test file, because it was written
 * twice and both copies had the same fault: they placed every reinforcement
 * on the first territory in the list, which buries the armies inland where
 * they can never reach anybody, and the game then runs forever. Fixing that
 * in one copy did nothing for the other. One player, one fix.
 */
export function chooseSimpleAction(
  state: GameState,
  random: RandomSource,
): GameAction {
  const actions = legalActions(state)

  const pick = <Item>(from: readonly Item[]): Item =>
    from[random.nextInt(from.length)] as Item

  // A player holding five cards is offered nothing else, so this comes first.
  const trades = actions.filter((each) => each.type === 'tradeCards')

  if (trades.length > 0) {
    return pick(trades)
  }

  const occupy = actions.find((each) => each.type === 'occupy')

  if (occupy !== undefined) {
    return { ...occupy, count: armyLimitFor(state, occupy) }
  }

  const places = actions.filter((each) => each.type === 'placeArmies')

  if (places.length > 0) {
    // Put the armies where they can be used. A territory surrounded by your
    // own land is the worst place for them.
    const frontier = places.filter((action) => {
      if (action.type !== 'placeArmies') {
        return false
      }

      const borders =
        state.map.territories.find((each) => each.id === action.territoryId)
          ?.borders ?? []

      return borders.some(
        (border) => state.territories[border]?.ownerId !== state.turn.playerId,
      )
    })

    const chosen = pick(frontier.length > 0 ? frontier : places)

    return chosen.type === 'placeArmies'
      ? { ...chosen, count: Math.max(1, state.turn.armiesToPlace) }
      : chosen
  }

  const worthwhile = actions.filter((action) => {
    if (action.type !== 'attack') {
      return false
    }

    return (
      (state.territories[action.fromId]?.armies ?? 0) >
      (state.territories[action.toId]?.armies ?? 0) + 1
    )
  })

  if (worthwhile.length > 0) {
    return pick(worthwhile)
  }

  const stop = actions.find((each) => each.type === 'endAttackPhase')

  return stop ?? { type: 'skipFortify' }
}
