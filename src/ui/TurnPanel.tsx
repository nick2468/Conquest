import type { GameState, TerritoryId } from '../engine'
import { Dice } from './Dice'
import { whatToDoNow } from './taps'

interface TurnPanelProps {
  readonly state: GameState
  readonly selectedId: TerritoryId | null
  readonly onEndAttacks: () => void
  readonly onSkipFortify: () => void
  /**
   * What just happened, when somebody else is playing.
   *
   * A person watching a computer take its turn needs to be told what it
   * did. "Tap a territory to attack from" is no use to them: it is not
   * their turn and there is nothing to tap.
   */
  readonly narration?: string | null
}

const PHASE_NAMES: Readonly<Record<GameState['turn']['phase'], string>> = {
  setup: 'First armies',
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
  narration = null,
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

      <p className="turn-instruction">
        {narration ?? whatToDoNow(state, selectedId)}
      </p>

      {state.turn.phase === 'reinforce' ? (
        <p className="turn-armies">
          <strong>{state.turn.armiesToPlace}</strong> armies left to place
        </p>
      ) : null}

      {state.turn.phase === 'setup' ? (
        <p className="turn-armies">
          <strong>{player?.reserve ?? 0}</strong> armies still in hand
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
            {state.turn.hasFortified ? 'End turn' : 'End turn without moving'}
          </button>
        ) : null}
      </div>
    </section>
  )
}
