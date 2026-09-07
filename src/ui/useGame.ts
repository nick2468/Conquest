import { useCallback, useState } from 'react'

import type {
  GameAction,
  GameOptions,
  GameState,
  NewPlayer,
  RandomSource,
} from '../engine'
import { applyAction, createGame, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'

export interface NewGameSettings {
  readonly players: readonly NewPlayer[]
  readonly seed: number
  readonly options: GameOptions
}

/**
 * The game and the dice, held together.
 *
 * The random source carries its own position, so it must be the SAME object
 * from one action to the next. It is kept beside the state rather than in a
 * ref, so starting a new game replaces both at once and neither can be left
 * behind.
 */
interface Holding {
  readonly state: GameState
  /** Rolls the dice. */
  readonly random: RandomSource
  /**
   * Breaks ties for computer players.
   *
   * Separate from the dice on purpose. If a computer player drew from the
   * same source, adding an opponent would change every roll in the game,
   * and the same seed would stop meaning the same game.
   */
  readonly chooser: RandomSource
}

function deal(settings: NewGameSettings): Holding {
  // One source deals the board, a second rolls the dice for the whole game.
  // Two sources from one seed keep the board the same when only the dice
  // differ, which makes a board easy to set up again.
  const dealer = seededRandom(settings.seed)
  const random = seededRandom(settings.seed * 7919 + 13)
  const chooser = seededRandom(settings.seed * 104729 + 5)

  return {
    state: createGame({
      map: AUSTRALIA,
      players: settings.players,
      random: dealer,
      options: settings.options,
    }),
    random,
    chooser,
  }
}

export function useGame(initial: NewGameSettings) {
  const [holding, setHolding] = useState<Holding>(() => deal(initial))

  /**
   * Do one action.
   *
   * applyAction runs OUTSIDE the state updater on purpose. It takes a number
   * from the random source, so calling it twice would give a different game.
   * React runs an updater twice on purpose during development, to catch
   * exactly this kind of thing.
   */
  const act = useCallback(
    (action: GameAction) => {
      setHolding({
        ...holding,
        state: applyAction(holding.state, action, holding.random),
      })
    },
    [holding],
  )

  /**
   * Keep acting until there is nothing more to do.
   *
   * `chooseNext` is asked for an action, and returns null to stop. It sees
   * the state after each step, which a loop of `act` calls could not: React
   * only hands over the new state on the next render.
   *
   * Used by "place the rest for me" during setup, where a player would
   * otherwise face a hundred taps.
   */
  const actUntilDone = useCallback(
    (chooseNext: (state: GameState) => GameAction | null) => {
      let state = holding.state

      // A guard, not a rule. It stops a chooser that never returns null from
      // hanging the page, and 2000 is far more than any real run needs.
      for (let step = 0; step < 2000; step += 1) {
        const action = chooseNext(state)

        if (action === null) {
          break
        }

        state = applyAction(state, action, holding.random)
      }

      setHolding({ ...holding, state })
    },
    [holding],
  )

  const newGame = useCallback((settings: NewGameSettings) => {
    setHolding(deal(settings))
  }, [])

  return {
    state: holding.state,
    chooser: holding.chooser,
    act,
    actUntilDone,
    newGame,
  }
}
