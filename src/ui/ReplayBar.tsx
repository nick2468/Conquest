import type { GameState } from '../engine'
import type { Replay } from './useReplay'
import { SPEEDS } from './useReplay'

/**
 * The controls for watching a finished game again. Plan task 4.55.
 *
 * It takes the place of the turn panel, because during a replay there is no
 * turn to take. Everything else on the screen carries on as normal: the map
 * and the scores panel are drawn from whatever board they are handed, so
 * they follow the replay without knowing it is one.
 *
 * Deliberately plain. Nick asked to watch the colours coalesce, so the
 * controls should stay out of the way of the map.
 */
export function ReplayBar({
  replay,
  state,
}: {
  readonly replay: Replay
  readonly state: GameState
}) {
  const done = replay.at >= replay.last
  const player = state.players.find((each) => each.id === state.turn.playerId)

  return (
    <section className="replay-bar" aria-label="Watching the game again">
      <div className="replay-where">
        <strong>
          {state.winnerId === null ? `Round ${state.round}` : 'The end'}
        </strong>
        {state.winnerId === null && player !== undefined ? (
          <span className="replay-who">
            <span className="swatch" style={{ background: player.colour }} />
            {player.name}
          </span>
        ) : null}
        <span className="replay-count">
          move {replay.at} of {replay.last}
        </span>
      </div>

      <input
        className="replay-slider"
        type="range"
        min={0}
        max={replay.last}
        value={replay.at}
        aria-label="How far through the game"
        onChange={(event) => replay.goTo(Number(event.target.value))}
      />

      <div className="replay-buttons">
        <button
          type="button"
          onClick={() =>
            done ? replay.goTo(0) : replay.setPlaying(!replay.playing)
          }
        >
          {done ? 'Watch again' : replay.playing ? 'Pause' : 'Play'}
        </button>

        <label className="replay-speed">
          Speed
          <select
            value={replay.speed}
            onChange={(event) =>
              replay.setSpeed(Number(event.target.value) as (typeof SPEEDS)[number])
            }
          >
            {SPEEDS.map((each) => (
              <option key={each} value={each}>
                {each} a second
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={replay.stop}>
          Done
        </button>
      </div>
    </section>
  )
}
