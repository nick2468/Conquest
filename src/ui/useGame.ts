import { useCallback, useState } from 'react'

import type {
  GameAction,
  GameOptions,
  GameState,
  NewPlayer,
  RandomSource,
  Recording,
} from '../engine'
import type { GameMap } from '../engine'
import { applyAction, createGame, seededRandom } from '../engine'

export interface NewGameSettings {
  /**
   * The board itself, not a name for it.
   *
   * It used to be one of two names, and the game looked up which map that
   * meant. Once a player can load a map of their own there is no list of
   * names to look it up in, so the setting carries the map. See plan task
   * 5.7.
   */
  readonly map: GameMap
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
  /**
   * The board before anybody moved, and every action since, so the game can
   * be watched again when it is over. Plan task 4.55.
   *
   * Only the actions are kept, never the boards. The engine is pure and the
   * dice come from a seeded source, so replaying the actions produces
   * exactly the same game. See `engine/replay.ts`.
   */
  readonly recording: Recording
  /** The seed the dice source started from, so a replay can begin again. */
  readonly diceSeed: number
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
  const diceSeed = settings.seed * 7919 + 13
  const random = seededRandom(diceSeed)
  const chooser = seededRandom(settings.seed * 104729 + 5)

  const state = createGame({
    map: settings.map,
    players: settings.players,
    random: dealer,
    options: settings.options,
  })

  return {
    state,
    random,
    chooser,
    recording: { first: state, actions: [] },
    diceSeed,
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
        recording: {
          first: holding.recording.first,
          actions: [...holding.recording.actions, action],
        },
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
      const taken: GameAction[] = []

      // A guard, not a rule. It stops a chooser that never returns null from
      // hanging the page, and 2000 is far more than any real run needs.
      for (let step = 0; step < 2000; step += 1) {
        const action = chooseNext(state)

        if (action === null) {
          break
        }

        taken.push(action)
        state = applyAction(state, action, holding.random)
      }

      setHolding({
        ...holding,
        state,
        recording: {
          first: holding.recording.first,
          actions: [...holding.recording.actions, ...taken],
        },
      })
    },
    [holding],
  )

  const newGame = useCallback((settings: NewGameSettings) => {
    setHolding(deal(settings))
  }, [])

  return {
    state: holding.state,
    chooser: holding.chooser,
    recording: holding.recording,
    diceSeed: holding.diceSeed,
    act,
    actUntilDone,
    newGame,
  }
}
