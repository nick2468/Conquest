import type { GameState } from '../engine'

interface GameLogProps {
  readonly state: GameState
  /**
   * How many entries to draw.
   *
   * A long game writes thousands. Drawing them all puts thousands of
   * elements on the page for nobody to read, and a game seen live reached
   * 2451 of them. Only the recent ones are drawn, and the rest are counted.
   */
  readonly mostToShow?: number
}

/**
 * Everything that has happened, newest first.
 *
 * Each round gets a heading, so a long game can be read back without
 * counting. See spec S7.
 */
export function GameLog({ state, mostToShow = 60 }: GameLogProps) {
  const newestFirst = [...state.log].reverse().slice(0, mostToShow)
  const older = state.log.length - newestFirst.length

  return (
    <section className="log" aria-label="What has happened">
      <h2>History</h2>
      <ol>
        {newestFirst.map((entry, index) => {
          const before = newestFirst[index + 1]
          const startsARound = before !== undefined && before.round < entry.round
          const colour =
            entry.playerId === null
              ? null
              : (state.players.find((each) => each.id === entry.playerId)
                  ?.colour ?? null)

          return (
            <li key={state.log.length - index}>
              {startsARound ? (
                <span className="log-round">Round {entry.round}</span>
              ) : null}
              {colour === null ? null : (
                <span className="log-dot" style={{ background: colour }} />
              )}
              {entry.text}
            </li>
          )
        })}
      </ol>

      {older === 0 ? null : (
        <p className="log-older">and {older} earlier</p>
      )}
    </section>
  )
}
