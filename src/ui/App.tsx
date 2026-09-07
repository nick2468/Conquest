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
import { effectFor } from './effects'
import { playSound, rememberSound, soundWasOn, startSound } from './sounds'
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

  /**
   * Counts every move made, by anybody.
   *
   * The animation is keyed on it. Attacking the same border twice in a row
   * is the same action twice, so without a number that changes, React would
   * keep the first animation and the second attack would show nothing.
   */
  const [moveNumber, setMoveNumber] = useState(0)

  /**
   * Whether the game makes a noise. Off until asked. See spec S25.
   *
   * Two things outside our control make this the right default. A browser
   * refuses to play a sound before the person has touched the page. iPadOS
   * also mutes web audio with the side switch, so sound can be switched on
   * in the game and still be silent.
   */
  const [soundOn, setSoundOn] = useState(soundWasOn)

  /**
   * What to say after the sound switch was tapped, or null for nothing.
   *
   * Nick found sound working in a browser on the computer and not on the
   * iPad. There are three different reasons that can happen and they need
   * three different answers, so the game says which one it is.
   */
  const [soundNote, setSoundNote] = useState<string | null>(null)

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
   * Make one move, and show it.
   *
   * Everything that changes the game goes through here, so a person's move
   * and a computer's move are shown the same way. The state changes at once
   * and the effect is drawn over the top. Nothing waits for it. Spec S24.
   */
  const perform = (action: GameAction): void => {
    setLastMove(action)
    setMoveNumber((counted) => counted + 1)

    if (soundOn) {
      const effect = effectFor(state.map, action)

      if (effect !== null) {
        playSound(effect.kind)
      }
    }

    setSoundNote(null)
    act(action)
  }

  const turnSoundOn = (): void => {
    const wanted = !soundOn

    setSoundOn(wanted)
    rememberSound(wanted)

    if (!wanted) {
      setSoundNote(null)
      return
    }

    // A browser only lets sound through from inside a tap, so the switch
    // itself has to start it. What comes back says which of the three
    // things went wrong, if any did.
    void startSound().then((how) => {
      if (how === 'none') {
        setSoundNote('This browser cannot make sounds.')
        return
      }

      if (how === 'blocked') {
        setSoundNote('The browser is still holding sound back. Tap it again.')
        return
      }

      setSoundNote(
        'Two notes just played. If you heard nothing, the iPad is in silent mode.',
      )
    })
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
      perform(playerFor(playing).chooseAction(state, chooser))
      setSelectedId(null)
      setPendingFortify(null)
    }, thinkingFor)

    return () => clearTimeout(timer)
  }, [playing, state, act, chooser, thinkingFor, lastMove, soundOn])

  const run = (action: GameAction): void => {
    perform(action)
    forget()
  }

  const start = (chosen: GameSetup): void => {
    setSetup(chosen)
    forget()
    setLastMove(null)
    setMoveNumber(0)
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

  // What to draw over the board for the move just made. See spec S23.
  const effect = lastMove === null ? null : effectFor(state.map, lastMove)
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
        perform(result.action)

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

          <button
            type="button"
            onClick={turnSoundOn}
            aria-pressed={soundOn}
            title={
              soundOn
                ? 'Turn the sound off'
                : 'Turn the sound on. An iPad side switch set to silent mutes it anyway.'
            }
          >
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>

          <button type="button" onClick={() => setScreen('newGame')}>
            New game
          </button>
        </div>

        {soundNote === null ? null : (
          <p className="sound-note" role="status">
            {soundNote}
          </p>
        )}
      </header>

      <MapView
        state={state}
        highlights={computer ? (watching?.highlights ?? EMPTY_HIGHLIGHTS) : highlights}
        selectedId={computer ? (watching?.from ?? null) : selectedId}
        onTap={computer ? () => undefined : handleTap}
        lookingAt={view}
        effect={effect}
        moveNumber={moveNumber}
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
