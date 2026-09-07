import type { GameAction, GameState, TerritoryId } from '../engine'
import { legalActions } from '../engine'

/**
 * What a tap on the map should do.
 *
 * This file holds no React and draws nothing, so every rule below can be
 * tested without a browser. The screen calls `whatATapDoes` and obeys it.
 *
 * Everything here is worked out from `legalActions`. The screen never has an
 * opinion about the rules. See spec S11.
 */

/** What the screen should do about a tap. */
export type TapResult =
  /** Do this action now. */
  | { readonly kind: 'act'; readonly action: GameAction }
  /** Remember this territory as the one the armies come from. */
  | { readonly kind: 'select'; readonly territoryId: TerritoryId }
  /** Forget the territory that was chosen. */
  | { readonly kind: 'clear' }
  /** Ask how many armies to move, then act. */
  | {
      readonly kind: 'askHowMany'
      readonly fromId: TerritoryId
      readonly toId: TerritoryId
    }
  /** The tap means nothing here. */
  | { readonly kind: 'ignore' }

/** Which territories the screen should light up. */
export interface Highlights {
  /** Tapping one of these starts something. */
  readonly canStart: ReadonlySet<TerritoryId>
  /** Tapping one of these finishes what the chosen territory started. */
  readonly canFinish: ReadonlySet<TerritoryId>
}

function actionsOf(state: GameState): GameAction[] {
  return legalActions(state)
}

/** The territories a tap could usefully land on right now. */
export function highlightsFor(
  state: GameState,
  selectedId: TerritoryId | null,
): Highlights {
  const canStart = new Set<TerritoryId>()
  const canFinish = new Set<TerritoryId>()

  for (const action of actionsOf(state)) {
    switch (action.type) {
      case 'placeArmies':
        canStart.add(action.territoryId)
        break

      case 'attack':
        canStart.add(action.fromId)

        if (action.fromId === selectedId) {
          canFinish.add(action.toId)
        }
        break

      case 'fortify':
        canStart.add(action.fromId)

        if (action.fromId === selectedId) {
          canFinish.add(action.toId)
        }
        break

      default:
        break
    }
  }

  return { canStart, canFinish }
}

/**
 * Work out what a tap on a territory means.
 *
 * The pattern is the same in every phase that needs two territories: the
 * first tap chooses where the armies come from, the second chooses where
 * they go. Tapping the chosen territory again lets it go.
 */
export function whatATapDoes(
  state: GameState,
  selectedId: TerritoryId | null,
  tappedId: TerritoryId,
): TapResult {
  const actions = actionsOf(state)
  const { canStart, canFinish } = highlightsFor(state, selectedId)

  switch (state.turn.phase) {
    case 'reinforce': {
      const place = actions.find(
        (action) =>
          action.type === 'placeArmies' && action.territoryId === tappedId,
      )

      return place === undefined ? { kind: 'ignore' } : { kind: 'act', action: place }
    }

    case 'attack': {
      if (tappedId === selectedId) {
        return { kind: 'clear' }
      }

      if (selectedId !== null && canFinish.has(tappedId)) {
        return {
          kind: 'act',
          action: { type: 'attack', fromId: selectedId, toId: tappedId },
        }
      }

      if (canStart.has(tappedId)) {
        return { kind: 'select', territoryId: tappedId }
      }

      return selectedId === null ? { kind: 'ignore' } : { kind: 'clear' }
    }

    case 'fortify': {
      if (tappedId === selectedId) {
        return { kind: 'clear' }
      }

      if (selectedId !== null && canFinish.has(tappedId)) {
        // Fortifying moves a number of armies, so the screen has to ask.
        return { kind: 'askHowMany', fromId: selectedId, toId: tappedId }
      }

      if (canStart.has(tappedId)) {
        return { kind: 'select', territoryId: tappedId }
      }

      return selectedId === null ? { kind: 'ignore' } : { kind: 'clear' }
    }

    // Occupying is answered in its own prompt, and the game is over when it
    // is over. Neither listens to the map.
    default:
      return { kind: 'ignore' }
  }
}

/** A plain sentence saying what the player should do now. */
export function whatToDoNow(
  state: GameState,
  selectedId: TerritoryId | null,
): string {
  const player =
    state.players.find((each) => each.id === state.turn.playerId)?.name ??
    'Somebody'

  switch (state.turn.phase) {
    case 'reinforce':
      return `${player}, tap your territories to place ${state.turn.armiesToPlace} armies.`

    case 'attack':
      return selectedId === null
        ? `${player}, tap a territory to attack from, or end your attacks.`
        : 'Now tap the territory you want to attack.'

    case 'occupy':
      return 'Choose how many armies move into the territory you took.'

    case 'fortify':
      return selectedId === null
        ? `${player}, you may move armies once, or skip it.`
        : 'Now tap where the armies should go.'

    case 'gameOver':
      return `${
        state.players.find((each) => each.id === state.winnerId)?.name ??
        'Somebody'
      } has won.`
  }
}
