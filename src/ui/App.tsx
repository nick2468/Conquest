import { useMemo, useState } from 'react'

import { GAME_NAME, createGame, seededRandom } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { MapView } from './MapView'

/**
 * A board to look at while phase 1 finishes.
 *
 * It deals a real game with the real engine and draws it. Nothing here plays
 * a turn yet. Phase 2.2 adds that.
 *
 * The seed box exists because a seeded game is repeatable. Type 7 twice and
 * you get the same board twice. It is also the quickest way to see that the
 * dealing is fair, by flicking through boards.
 */
export function App() {
  const [seed, setSeed] = useState(1)
  const [playerCount, setPlayerCount] = useState(3)

  const state = useMemo(
    () =>
      createGame({
        map: AUSTRALIA,
        players: Array.from({ length: playerCount }, (_unused, index) => ({
          name: `Player ${index + 1}`,
          kind: 'human' as const,
        })),
        random: seededRandom(seed),
      }),
    [seed, playerCount],
  )

  const armiesOf = (playerId: string): number =>
    Object.values(state.territories)
      .filter((territory) => territory.ownerId === playerId)
      .reduce((total, territory) => total + territory.armies, 0)

  const territoriesOf = (playerId: string): number =>
    Object.values(state.territories).filter(
      (territory) => territory.ownerId === playerId,
    ).length

  return (
    <main className="board-page">
      <header className="board-header">
        <h1>{GAME_NAME}</h1>
        <p>{state.map.name}, dealt by the rules engine.</p>
      </header>

      <MapView state={state} />

      <section className="panel">
        <div className="controls">
          <label>
            Players
            <select
              value={playerCount}
              onChange={(event) => setPlayerCount(Number(event.target.value))}
            >
              {[2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <label>
            Seed
            <input
              type="number"
              min={1}
              value={seed}
              onChange={(event) =>
                setSeed(Math.max(1, Number(event.target.value)))
              }
            />
          </label>

          <button type="button" onClick={() => setSeed(seed + 1)}>
            Deal again
          </button>
        </div>

        <table className="scores">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Territories</th>
              <th scope="col">Armies</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((player) => (
              <tr key={player.id}>
                <th scope="row">
                  <span
                    className="swatch"
                    style={{ background: player.colour }}
                  />
                  {player.name}
                </th>
                <td>{territoriesOf(player.id)}</td>
                <td>{armiesOf(player.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="turn-note">
          {state.players.find((each) => each.id === state.turn.playerId)?.name}{' '}
          would start, with {state.turn.armiesToPlace} armies to place.
        </p>
      </section>
    </main>
  )
}
