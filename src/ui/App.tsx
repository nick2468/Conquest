import { useState } from 'react'

import type { GameAction, GameOptions, TerritoryId } from '../engine'
import { DEFAULT_OPTIONS, GAME_NAME, armyLimitFor } from '../engine'
import { ArmyChooser } from './ArmyChooser'
import { CardsPanel } from './CardsPanel'
import { MapView } from './MapView'
import { TurnPanel } from './TurnPanel'
import { highlightsFor, whatATapDoes } from './taps'
import { useGame } from './useGame'

/** A fortify move waiting for the player to say how many armies. */
interface PendingFortify {
  readonly fromId: TerritoryId
  readonly toId: TerritoryId
}

export function App() {
  const [playerCount, setPlayerCount] = useState(3)
  const [seed, setSeed] = useState(1)
  // Options are picked before a game starts, per spec section 7, so this
  // is what the NEXT game will use.
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS)
  const { state, act, newGame } = useGame({ playerCount, seed, options })

  const [selectedId, setSelectedId] = useState<TerritoryId | null>(null)
  const [pendingFortify, setPendingFortify] = useState<PendingFortify | null>(
    null,
  )

  const highlights = highlightsFor(state, selectedId)
  const occupation = state.turn.pendingOccupation

  const run = (action: GameAction): void => {
    act(action)
    setSelectedId(null)
    setPendingFortify(null)
  }

  const handleTap = (territoryId: TerritoryId): void => {
    const result = whatATapDoes(state, selectedId, territoryId)

    switch (result.kind) {
      case 'act':
        // Attacking again from the same place is normal, so the chosen
        // territory stays chosen after an attack.
        act(result.action)

        if (result.action.type !== 'attack') {
          setSelectedId(null)
        }
        break

      case 'select':
        setSelectedId(result.territoryId)
        break

      case 'clear':
        setSelectedId(null)
        break

      case 'askHowMany':
        setPendingFortify({ fromId: result.fromId, toId: result.toId })
        break

      case 'ignore':
        break
    }
  }

  const startNewGame = (
    players: number,
    nextSeed: number,
    nextOptions: GameOptions,
  ): void => {
    setPlayerCount(players)
    setSeed(nextSeed)
    setOptions(nextOptions)
    setSelectedId(null)
    setPendingFortify(null)
    newGame({ playerCount: players, seed: nextSeed, options: nextOptions })
  }

  const nameOf = (territoryId: TerritoryId): string =>
    state.map.territories.find((each) => each.id === territoryId)?.name ??
    territoryId

  const winner = state.players.find((each) => each.id === state.winnerId)

  return (
    <main className="board-page">
      <header className="board-header">
        <h1>{GAME_NAME}</h1>
        <div className="new-game">
          <label>
            Players
            <select
              value={playerCount}
              onChange={(event) =>
                startNewGame(Number(event.target.value), seed, options)
              }
            >
              {[2, 3, 4, 5, 6].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <label>
            Dice
            <select
              value={options.diceDisplay}
              onChange={(event) =>
                startNewGame(playerCount, seed, {
                  ...options,
                  diceDisplay: event.target
                    .value as GameOptions['diceDisplay'],
                })
              }
            >
              <option value="allAtOnce">All at once</option>
              <option value="oneByOne">One at a time</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => startNewGame(playerCount, seed + 1, options)}
          >
            New game
          </button>
        </div>
      </header>

      <MapView
        state={state}
        highlights={highlights}
        selectedId={selectedId}
        onTap={handleTap}
      />

      <div className="side">
        {winner === undefined ? (
          <TurnPanel
            state={state}
            selectedId={selectedId}
            onEndAttacks={() => run({ type: 'endAttackPhase' })}
            onSkipFortify={() => run({ type: 'skipFortify' })}
          />
        ) : (
          <section className="winner">
            <h2>{winner.name} has won</h2>
            <p>Every territory on the map is theirs.</p>
            <button
              type="button"
              className="primary"
              onClick={() => startNewGame(playerCount, seed + 1, options)}
            >
              Play again
            </button>
          </section>
        )}

        {occupation === null ? null : (
          <ArmyChooser
            title="Move in"
            detail={`You took ${nameOf(occupation.toId)}. How many armies move in from ${nameOf(occupation.fromId)}?`}
            least={occupation.minimumArmies}
            most={occupation.maximumArmies}
            confirmLabel="Move in"
            onConfirm={(count) => run({ type: 'occupy', count })}
          />
        )}

        {pendingFortify === null ? null : (
          <ArmyChooser
            title="Move armies"
            detail={`How many armies move from ${nameOf(pendingFortify.fromId)} to ${nameOf(pendingFortify.toId)}? This ends your turn.`}
            least={1}
            most={armyLimitFor(state, {
              type: 'fortify',
              fromId: pendingFortify.fromId,
              toId: pendingFortify.toId,
              count: 1,
            })}
            confirmLabel="Move and end turn"
            onCancel={() => {
              setPendingFortify(null)
              setSelectedId(null)
            }}
            onConfirm={(count) =>
              run({
                type: 'fortify',
                fromId: pendingFortify.fromId,
                toId: pendingFortify.toId,
                count,
              })
            }
          />
        )}

        {winner === undefined ? (
          <CardsPanel
            state={state}
            onTrade={(cardIds) => run({ type: 'tradeCards', cardIds })}
          />
        ) : null}

        <table className="scores">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Land</th>
              <th scope="col">Armies</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((player) => {
              const mine = Object.values(state.territories).filter(
                (each) => each.ownerId === player.id,
              )

              return (
                <tr
                  key={player.id}
                  className={player.isEliminated ? 'out' : undefined}
                >
                  <th scope="row">
                    <span
                      className="swatch"
                      style={{ background: player.colour }}
                    />
                    {player.name}
                    {player.id === state.turn.playerId ? ' •' : ''}
                  </th>
                  <td>{mine.length}</td>
                  <td>
                    {mine.reduce((total, each) => total + each.armies, 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <section className="log" aria-label="What has happened">
          <h2>History</h2>
          <ol>
            {state.log
              .slice(-12)
              .reverse()
              .map((entry, index) => (
                <li key={state.log.length - index}>{entry.text}</li>
              ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
