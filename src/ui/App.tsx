import { useEffect, useState } from 'react'

import type { GameAction, GameState, Skill, TerritoryId } from '../engine'
import { GAME_NAME, armyLimitFor, legalActions, playerFor } from '../engine'
import { ArmyChooser } from './ArmyChooser'
import { CardsPanel } from './CardsPanel'
import { GameLog } from './GameLog'
import { MapView } from './MapView'
import type { GameSetup } from './NewGameScreen'
import { DEFAULT_SETUP, NewGameScreen } from './NewGameScreen'
import { TurnPanel } from './TurnPanel'
import { UpdateBanner } from './UpdateBanner'
import { WinnerScreen } from './WinnerScreen'
import { highlightsFor, whatATapDoes } from './taps'
import { useGame } from './useGame'
import { useUpdate } from './useUpdate'

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

/**
 * How long a computer player waits between moves, in milliseconds.
 *
 * An attack gets longer, because it is the only move with a result worth
 * reading: the dice, and who lost what. Placing armies and fortifying just
 * change a number.
 */
const MOVE_PAUSE = 700
const PAUSE_AFTER_A_FIGHT = 1500

/** Nothing lit up. Used while a computer is moving. */
const EMPTY_HIGHLIGHTS = {
  canStart: new Set<TerritoryId>(),
  canFinish: new Set<TerritoryId>(),
}

export function App() {
  const [setup, setSetup] = useState<GameSetup>(DEFAULT_SETUP)
  const [screen, setScreen] = useState<'newGame' | 'playing'>('newGame')
  const { state, chooser, act, actUntilDone, newGame } = useGame(setup)

  const [selectedId, setSelectedId] = useState<TerritoryId | null>(null)
  const [pendingFortify, setPendingFortify] = useState<PendingFortify | null>(
    null,
  )

  /**
   * The place being looked at closely, or null for the whole board.
   *
   * Nick's idea. On a board of 38 places, Perth and Canberra are a few
   * millimetres across on an iPad. Tapping the whole board opens a close
   * view of that place and everywhere it borders, where everything is a
   * real target and the names are written out in full.
   */
  const [lookingAt, setLookingAt] = useState<TerritoryId | null>(null)

  const update = useUpdate()

  /**
   * What the computer just did, so the map can show it.
   *
   * Nick: "the whole sequence is done in a flash and it is difficult to know
   * what happened." The speed was only half of it. The other half was that
   * the map was deliberately blanked during a computer turn, so there was
   * nothing to watch even when it was slow. Now the two places involved in
   * its move are lit up exactly as they would be for a person.
   */
  const [lastMove, setLastMove] = useState<GameAction | null>(null)

  // Which computer player, if any, should be moving right now.
  const whoseTurn = state.players.find(
    (each) => each.id === state.turn.playerId,
  )
  const playing: Skill | null =
    screen === 'playing' &&
    state.winnerId === null &&
    whoseTurn !== undefined &&
    whoseTurn.kind !== 'human'
      ? whoseTurn.kind
      : null

  const forget = (): void => {
    setSelectedId(null)
    setPendingFortify(null)
  }

  /**
   * Step back out to the whole board, KEEPING whatever is chosen.
   *
   * Clearing the choice here was a real bug, found by Nick playing it. A
   * fortify move needs two places that can be a long way apart: you zoom in
   * to pick where the armies come from, step out to find where they are
   * going, and zoom in again to pick it. Forgetting the first place on the
   * way out makes that impossible.
   *
   * Tapping the chosen place again is how you let it go.
   */
  const showWholeBoard = (): void => {
    setLookingAt(null)
  }

  /**
   * A computer player takes its turn.
   *
   * One move per tick, with a pause between, so a person can follow what is
   * happening rather than watching a board change all at once. Each move
   * changes the state, which runs this again, which is the loop.
   *
   * The dice source lives in useGame and carries its position, so the
   * cleanup below matters: without it a paused game could roll dice nobody
   * asked for.
   */
  const thinkingFor = !playing
    ? 0
    : lastMove?.type === 'attack'
      ? PAUSE_AFTER_A_FIGHT
      : MOVE_PAUSE

  useEffect(() => {
    if (!playing) {
      return
    }

    const timer = setTimeout(() => {
      const move = playerFor(playing).chooseAction(state, chooser)

      setLastMove(move)
      act(move)
      setSelectedId(null)
      setPendingFortify(null)
    }, thinkingFor)

    return () => clearTimeout(timer)
  }, [playing, state, act, chooser, thinkingFor, lastMove])

  const run = (action: GameAction): void => {
    act(action)
    forget()
  }

  const start = (chosen: GameSetup): void => {
    setSetup(chosen)
    forget()
    setLastMove(null)
    setLookingAt(null)
    newGame(chosen)
    setScreen('playing')
  }

  // A game is "in progress" once somebody has actually done something. On
  // the setup phase of round one, nothing would be lost by reloading.
  const gameInProgress =
    screen === 'playing' &&
    state.winnerId === null &&
    (state.round > 1 || state.turn.phase !== 'setup')

  const banner = update.waiting ? (
    <UpdateBanner
      gameInProgress={gameInProgress}
      onUpdate={update.take}
      onLater={update.later}
    />
  ) : null

  if (screen === 'newGame') {
    return (
      <>
        <NewGameScreen
          startWith={setup}
          onStart={start}
          onCancel={
            state.round > 1 || state.turn.phase !== 'setup'
              ? () => setScreen('playing')
              : undefined
          }
        />
        {banner}
      </>
    )
  }

  const highlights = highlightsFor(state, selectedId)
  const occupation = state.turn.pendingOccupation
  const current = state.players.find((each) => each.id === state.turn.playerId)
  const computer = current !== undefined && current.kind !== 'human'

  // A computer player moves anywhere, so its turn is watched from above.
  const view = computer ? null : lookingAt

  const watching = computer ? showing(lastMove) : null
  const closeUpOn = state.map.territories.find((each) => each.id === view)

  const handleTap = (territoryId: TerritoryId): void => {
    // On the whole board a tap opens the close view. Playing happens in the
    // close view, where everything is big enough to hit.
    if (lookingAt === null) {
      setLookingAt(territoryId)
      return
    }

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
        // The view follows what you pick up. Choosing somewhere to attack
        // from and then finding it half off the edge is no use: its targets
        // are exactly the places that need to be on screen.
        setLookingAt(result.territoryId)
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
    <>
    <main className="board-page">
      <header className="board-header">
        <h1>
          {GAME_NAME}
          {closeUpOn === undefined ? null : (
            <span className="looking-at">{closeUpOn.name}</span>
          )}
        </h1>
        <div className="new-game">
          {state.turn.phase === 'setup' ? (
            <button
              type="button"
              onClick={() => actUntilDone(thinnestPlacement)}
            >
              Place the rest for us
            </button>
          ) : null}

          {closeUpOn === undefined ? null : (
            <button type="button" className="primary" onClick={showWholeBoard}>
              Whole map
            </button>
          )}

          <button type="button" onClick={() => setScreen('newGame')}>
            New game
          </button>
        </div>
      </header>

      <MapView
        state={state}
        highlights={computer ? (watching?.highlights ?? EMPTY_HIGHLIGHTS) : highlights}
        selectedId={computer ? (watching?.from ?? null) : selectedId}
        onTap={computer ? () => undefined : handleTap}
        lookingAt={view}
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
            narration={
              computer ? (state.log.at(-1)?.text ?? null) : null
            }
            onEndAttacks={() => run({ type: 'endAttackPhase' })}
            onSkipFortify={() => run({ type: 'skipFortify' })}
          />
        )}

        {occupation === null || computer ? null : (
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

        {over || computer || state.turn.phase === 'setup' ? null : (
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
    {banner}
    </>
  )
}

/**
 * The places a computer's move touches, so they can be lit up.
 *
 * An attack shows both ends. Everything else shows the one place it lands
 * on, which is enough to follow an army being placed or moved.
 */
function showing(move: GameAction | null): {
  readonly from: TerritoryId | null
  readonly highlights: { canStart: Set<TerritoryId>; canFinish: Set<TerritoryId> }
} | null {
  if (move === null) {
    return null
  }

  if (move.type === 'attack' || move.type === 'fortify') {
    return {
      from: move.fromId,
      highlights: {
        canStart: new Set([move.fromId]),
        canFinish: new Set([move.toId]),
      },
    }
  }

  if (move.type === 'placeArmies') {
    return {
      from: move.territoryId,
      highlights: { canStart: new Set([move.territoryId]), canFinish: new Set() },
    }
  }

  return null
}
