import { useCallback, useState } from 'react'

import type { GameAction, GameOptions, GameState, RandomSource } from '../engine'
import { applyAction, createGame, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'

export interface NewGameSettings {
  readonly playerCount: number
  readonly seed: number
  readonly options?: GameOptions
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
  readonly random: RandomSource
}

function deal(settings: NewGameSettings): Holding {
  // One source deals the board, a second rolls the dice for the whole game.
  // Two sources from one seed keep the board the same when only the dice
  // differ, which makes a board easy to set up again.
  const dealer = seededRandom(settings.seed)
  const random = seededRandom(settings.seed * 7919 + 13)

  return {
    state: createGame({
      map: AUSTRALIA,
      players: Array.from({ length: settings.playerCount }, (_u, index) => ({
        name: `Player ${index + 1}`,
        kind: 'human' as const,
      })),
      random: dealer,
      ...(settings.options === undefined ? {} : { options: settings.options }),
    }),
    random,
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
        state: applyAction(holding.state, action, holding.random),
        random: holding.random,
      })
    },
    [holding],
  )

  const newGame = useCallback((settings: NewGameSettings) => {
    setHolding(deal(settings))
  }, [])

  return { state: holding.state, act, newGame }
}
