import type { GameState, TerritoryId } from '../engine'
import { Dice } from './Dice'
import { whatToDoNow } from './taps'

interface TurnPanelProps {
  readonly state: GameState
  readonly selectedId: TerritoryId | null
  readonly onEndAttacks: () => void
  readonly onSkipFortify: () => void
}

const PHASE_NAMES: Readonly<Record<GameState['turn']['phase'], string>> = {
  reinforce: 'Reinforce',
  attack: 'Attack',
  occupy: 'Move in',
  fortify: 'Fortify',
  gameOver: 'Game over',
}

/** Whose turn it is, what they are doing, and the buttons for doing it. */
export function TurnPanel({
  state,
  selectedId,
  onEndAttacks,
  onSkipFortify,
}: TurnPanelProps) {
  const player = state.players.find(
    (each) => each.id === state.turn.playerId,
  )

  const dice = state.turn.lastAttack

  return (
    <section className="turn-panel">
      <div className="turn-who">
        <span
          className="swatch"
          style={{ background: player?.colour ?? '#999999' }}
        />
        <strong>{player?.name ?? 'Nobody'}</strong>
        <span className="turn-phase">
          {PHASE_NAMES[state.turn.phase]}
        </span>
        <span className="turn-round">Round {state.round}</span>
      </div>

      <p className="turn-instruction">{whatToDoNow(state, selectedId)}</p>

      {state.turn.phase === 'reinforce' ? (
        <p className="turn-armies">
          <strong>{state.turn.armiesToPlace}</strong> armies left to place
        </p>
      ) : null}

      {dice === null ? null : (
        <Dice outcome={dice} display={state.options.diceDisplay} />
      )}

      <div className="turn-buttons">
        {state.turn.phase === 'attack' ? (
          <button type="button" className="primary" onClick={onEndAttacks}>
            Done attacking
          </button>
        ) : null}

        {state.turn.phase === 'fortify' ? (
          <button type="button" className="primary" onClick={onSkipFortify}>
            End turn without moving
          </button>
        ) : null}
      </div>
    </section>
  )
}
