import { useState } from 'react'

import type { GameAction, GameState, TerritoryId } from '../engine'
import { GAME_NAME, armyLimitFor, legalActions } from '../engine'
import { ArmyChooser } from './ArmyChooser'
import { CardsPanel } from './CardsPanel'
import { GameLog } from './GameLog'
import { MapView } from './MapView'
import type { GameSetup } from './NewGameScreen'
import { DEFAULT_SETUP, NewGameScreen } from './NewGameScreen'
import { TurnPanel } from './TurnPanel'
import { WinnerScreen } from './WinnerScreen'
import { highlightsFor, whatATapDoes } from './taps'
import { useGame } from './useGame'

/** A fortify move waiting for the player to say how many armies. */
interface PendingFortify {
  readonly fromId: TerritoryId
  readonly toId: TerritoryId
}

/**
 * Put one army wherever this player is thinnest.
 *
 * Used by "place the rest for me", so a player who does not want a hundred
 * taps still gets a spread board rather than one huge stack.
 */
function thinnestPlacement(state: GameState): GameAction | null {
  const choices = legalActions(state).filter(
    (action) => action.type === 'placeArmies',
  )

  if (state.turn.phase !== 'setup' || choices.length === 0) {
    return null
  }

  return choices.reduce((thinnest, action) =>
    (state.territories[
      action.type === 'placeArmies' ? action.territoryId : ''
    ]?.armies ?? 0) <
    (state.territories[
      thinnest.type === 'placeArmies' ? thinnest.territoryId : ''
    ]?.armies ?? 0)
      ? action
      : thinnest,
  )
}

export function App() {
  const [setup, setSetup] = useState<GameSetup>(DEFAULT_SETUP)
  const [screen, setScreen] = useState<'newGame' | 'playing'>('newGame')
  const { state, act, actUntilDone, newGame } = useGame(setup)

  const [selectedId, setSelectedId] = useState<TerritoryId | null>(null)
  const [pendingFortify, setPendingFortify] = useState<PendingFortify | null>(
    null,
  )

  const forget = (): void => {
    setSelectedId(null)
    setPendingFortify(null)
  }

  const run = (action: GameAction): void => {
    act(action)
    forget()
  }

  const start = (chosen: GameSetup): void => {
    setSetup(chosen)
    forget()
    newGame(chosen)
    setScreen('playing')
  }

  if (screen === 'newGame') {
    return (
      <NewGameScreen
        startWith={setup}
        onStart={start}
        onCancel={
          state.round > 1 || state.turn.phase !== 'setup'
            ? () => setScreen('playing')
            : undefined
        }
      />
    )
  }

  const highlights = highlightsFor(state, selectedId)
  const occupation = state.turn.pendingOccupation
  const current = state.players.find((each) => each.id === state.turn.playerId)

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

  const nameOf = (territoryId: TerritoryId): string =>
    state.map.territories.find((each) => each.id === territoryId)?.name ??
    territoryId

  const over = state.winnerId !== null

  return (
    <main className="board-page">
      <header className="board-header">
        <h1>{GAME_NAME}</h1>
        <div className="new-game">
          {state.turn.phase === 'setup' ? (
            <button
              type="button"
              onClick={() => actUntilDone(thinnestPlacement)}
            >
              Place the rest for us
            </button>
          ) : null}

          <button type="button" onClick={() => setScreen('newGame')}>
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
        {over ? (
          <WinnerScreen
            state={state}
            onPlayAgain={() => start({ ...setup, seed: setup.seed + 1 })}
            onNewGame={() => setScreen('newGame')}
          />
        ) : (
          <TurnPanel
            state={state}
            selectedId={selectedId}
            onEndAttacks={() => run({ type: 'endAttackPhase' })}
            onSkipFortify={() => run({ type: 'skipFortify' })}
          />
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
            onCancel={forget}
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

        {over || state.turn.phase === 'setup' ? null : (
          <CardsPanel
            state={state}
            onTrade={(cardIds) => run({ type: 'tradeCards', cardIds })}
          />
        )}

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
                    {player.id === current?.id ? ' •' : ''}
                  </th>
                  <td>{mine.length}</td>
                  <td>
                    {mine.reduce((total, each) => total + each.armies, 0) +
                      player.reserve}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <GameLog state={state} />
      </div>
    </main>
  )
}
