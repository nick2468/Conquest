import { useState } from 'react'

import type { GameOptions, NewPlayer, PlayerKind } from '../engine'
import {
  ALL_SKILLS,
  DEFAULT_OPTIONS,
  GAME_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLOURS,
  playerFor,
} from '../engine'

export interface GameSetup {
  readonly players: readonly NewPlayer[]
  readonly options: GameOptions
  readonly seed: number
}

interface NewGameScreenProps {
  readonly startWith: GameSetup
  readonly onStart: (setup: GameSetup) => void
  readonly onCancel?: (() => void) | undefined
}

function defaultPlayers(count: number): NewPlayer[] {
  return Array.from({ length: count }, (_unused, index) => ({
    name: `Player ${index + 1}`,
    kind: 'human' as const,
    colour: PLAYER_COLOURS[index] as string,
  }))
}

export const DEFAULT_SETUP: GameSetup = {
  players: defaultPlayers(3),
  options: DEFAULT_OPTIONS,
  /**
   * A different starting point every time the app is opened.
   *
   * A fixed seed would deal the same board and play the same computer game
   * every single session, which is dull. The ENGINE still never calls
   * Math.random, per spec S10: the seed is chosen out here, once, and
   * handed in. So a game is still repeatable from its seed.
   */
  seed: Math.floor(Math.random() * 1_000_000) + 1,
}

/**
 * The screen before a game.
 *
 * Every rule that D9, D10 and D11 made selectable is chosen here, because
 * spec section 7 says options are picked before a game starts. There is
 * nowhere else they could honestly go.
 */
export function NewGameScreen({
  startWith,
  onStart,
  onCancel,
}: NewGameScreenProps) {
  const [players, setPlayers] = useState<NewPlayer[]>([...startWith.players])
  const [options, setOptions] = useState<GameOptions>(startWith.options)

  const setCount = (count: number): void => {
    setPlayers((current) =>
      count <= current.length
        ? current.slice(0, count)
        : [
            ...current,
            ...defaultPlayers(count).slice(current.length, count),
          ],
    )
  }

  const rename = (index: number, name: string): void => {
    setPlayers((current) =>
      current.map((player, at) => (at === index ? { ...player, name } : player)),
    )
  }

  const rekind = (index: number, kind: PlayerKind): void => {
    setPlayers((current) =>
      current.map((player, at) =>
        at === index
          ? {
              ...player,
              kind,
              // A player who was "Player 2" and becomes a computer takes the
              // computer's name, so the table reads as who is playing.
              name: nameFor(kind, at, player.name),
            }
          : player,
      ),
    )
  }

  const recolour = (index: number, colour: string): void => {
    setPlayers((current) =>
      current.map((player, at) =>
        at === index ? { ...player, colour } : player,
      ),
    )
  }

  const change = <Key extends keyof GameOptions>(
    key: Key,
    value: GameOptions[Key],
  ): void => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const named = players.map((player, index) => ({
    ...player,
    name: player.name.trim() === '' ? `Player ${index + 1}` : player.name,
  }))

  // Two players cannot share a colour, or the board becomes unreadable.
  const colours = named.map((player) => player.colour)
  const clash = new Set(colours).size !== colours.length

  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>{GAME_NAME}</h1>
        <p className="setup-lead">
          A turn-based territory game, set in Australia.
        </p>

        <section>
          <h2>Players</h2>

          <label className="setup-field">
            How many
            <select
              value={players.length}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {Array.from(
                { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
                (_unused, index) => MIN_PLAYERS + index,
              ).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <ul className="player-list">
            {players.map((player, index) => (
              <li key={index}>
                <input
                  type="text"
                  className="player-name"
                  value={player.name}
                  maxLength={16}
                  aria-label={`Name of player ${index + 1}`}
                  onChange={(event) => rename(index, event.target.value)}
                />

                <select
                  className="player-kind"
                  value={player.kind}
                  aria-label={`Who plays as player ${index + 1}`}
                  onChange={(event) =>
                    rekind(index, event.target.value as PlayerKind)
                  }
                >
                  <option value="human">A person</option>
                  {ALL_SKILLS.map((skill) => (
                    <option key={skill} value={skill}>
                      {playerFor(skill).name}
                    </option>
                  ))}
                </select>

                <span className="colour-choices">
                  {PLAYER_COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      className={
                        player.colour === colour
                          ? 'colour colour-picked'
                          : 'colour'
                      }
                      style={{ background: colour }}
                      aria-label={`Colour ${colour} for player ${index + 1}`}
                      aria-pressed={player.colour === colour}
                      onClick={() => recolour(index, colour)}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>

          {players.some((player) => player.kind !== 'human') ? (
            <ul className="skill-notes">
              {ALL_SKILLS.filter((skill) =>
                players.some((player) => player.kind === skill),
              ).map((skill) => (
                <li key={skill}>
                  <strong>{playerFor(skill).name}</strong>{' '}
                  {playerFor(skill).describe}
                </li>
              ))}
            </ul>
          ) : null}

          {clash ? (
            <p className="setup-warning">
              Two players share a colour. Give each player their own.
            </p>
          ) : null}
        </section>

        <section>
          <h2>Rules</h2>

          <label className="setup-field">
            First armies
            <select
              value={options.armyPlacement}
              onChange={(event) =>
                change(
                  'armyPlacement',
                  event.target.value as GameOptions['armyPlacement'],
                )
              }
            >
              <option value="automatic">Spread them for us</option>
              <option value="byHand">We place them, one at a time</option>
            </select>
          </label>

          <label className="setup-field">
            A set of cards is worth
            <select
              value={options.cardSetValue}
              onChange={(event) =>
                change(
                  'cardSetValue',
                  event.target.value as GameOptions['cardSetValue'],
                )
              }
            >
              <option value="rising">More each time (4, 6, 8, 10...)</option>
              <option value="fixed">The same every time</option>
            </select>
          </label>

          <label className="setup-field">
            Armies may move
            <select
              value={options.fortifyDistance}
              onChange={(event) =>
                change(
                  'fortifyDistance',
                  event.target.value as GameOptions['fortifyDistance'],
                )
              }
            >
              <option value="connected">Any distance through your land</option>
              <option value="adjacent">One step only</option>
            </select>
          </label>

          <label className="setup-field">
            Dice appear
            <select
              value={options.diceDisplay}
              onChange={(event) =>
                change(
                  'diceDisplay',
                  event.target.value as GameOptions['diceDisplay'],
                )
              }
            >
              <option value="allAtOnce">All at once</option>
              <option value="oneByOne">One at a time</option>
            </select>
          </label>
        </section>

        <div className="setup-buttons">
          {onCancel === undefined ? null : (
            <button type="button" onClick={onCancel}>
              Back to the game
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={clash}
            onClick={() =>
              onStart({
                players: named,
                options,
                seed: startWith.seed + 1,
              })
            }
          >
            Start
          </button>
        </div>
      </div>
    </main>
  )
}

/** The name a player gets when they change between a person and a computer. */
function nameFor(kind: PlayerKind, index: number, current: string): string {
  const wasDefault =
    current === `Player ${index + 1}` ||
    ALL_SKILLS.some((skill) => current === playerFor(skill).name)

  if (!wasDefault) {
    return current
  }

  return kind === 'human' ? `Player ${index + 1}` : playerFor(kind).name
}
