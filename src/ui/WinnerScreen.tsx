import type { GameState } from '../engine'
import { attacksIn, standingsIn } from './standings'

interface WinnerScreenProps {
  readonly state: GameState
  readonly onPlayAgain: () => void
  readonly onNewGame: () => void
}

/** How the game ended, and the two ways on from here. */
export function WinnerScreen({
  state,
  onPlayAgain,
  onNewGame,
}: WinnerScreenProps) {
  const winner = state.players.find((each) => each.id === state.winnerId)

  const standings = standingsIn(state)
  const attacks = attacksIn(state)

  return (
    <section className="winner" aria-label="The game is over">
      <span
        className="winner-swatch"
        style={{ background: winner?.colour ?? '#999999' }}
      />
      <h2>{winner?.name ?? 'Nobody'} has won</h2>
      <p>
        Every territory on the map is theirs, after {state.round} rounds and{' '}
        {attacks} attacks.
      </p>

      <ol className="winner-order">
        {standings.map(({ player, place }) => (
          <li key={player.id}>
            {place === 1 ? (
              <strong>{player.name}</strong>
            ) : (
              player.name
            )}
            {place === 1 ? ' won' : place === 2 ? ' went out last' : ''}
          </li>
        ))}
      </ol>

      <div className="winner-buttons">
        <button type="button" onClick={onNewGame}>
          Change the settings
        </button>
        <button type="button" className="primary" onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </section>
  )
}
