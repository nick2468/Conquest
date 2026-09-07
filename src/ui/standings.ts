import type { GameState, Player } from '../engine'

/** Where a player finished. */
export interface Standing {
  readonly player: Player
  /** 1 for the winner, 2 for whoever went out last, and so on. */
  readonly place: number
}

/**
 * Who finished where.
 *
 * The winner is first. Everyone else is ordered by how long they lasted,
 * which the log already records: the later a player went out, the longer
 * they survived. A player still holding land when the game ended, which
 * cannot happen in a finished game, is treated as having lasted to the end.
 */
export function standingsIn(state: GameState): Standing[] {
  const winner = state.players.find((each) => each.id === state.winnerId)

  const others = state.players
    .filter((each) => each.id !== state.winnerId)
    .map((player) => ({
      player,
      wentOutAt: state.log.findIndex(
        (entry) => entry.text === `${player.name} is out of the game.`,
      ),
    }))
    .map((each) => ({
      ...each,
      wentOutAt: each.wentOutAt === -1 ? state.log.length : each.wentOutAt,
    }))
    .sort((left, right) => right.wentOutAt - left.wentOutAt)

  const ordered = winner === undefined ? [] : [winner]

  return [...ordered, ...others.map((each) => each.player)].map(
    (player, index) => ({ player, place: index + 1 }),
  )
}

/** How many attacks the whole game took. */
export function attacksIn(state: GameState): number {
  return state.log.filter((entry) => entry.text.includes(' attacks ')).length
}
