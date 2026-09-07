import { useState } from 'react'

import type { Table } from './useTable'

/**
 * Opening a game other people join, and joining one. Plan task 6.2.
 *
 * The code is four letters and it is the whole of the joining. Somebody
 * reads it out across the room and the other person types it in. There are
 * no accounts, no sign in and nothing to install, because every one of
 * those is a place a twelve year old and his friends give up.
 */

interface TogetherScreenProps {
  readonly table: Table
  /** What the new game screen was set to, so a game opens with those rules. */
  readonly onOpen: (name: string) => void
  readonly onBack: () => void
}

export function TogetherScreen({ table, onOpen, onBack }: TogetherScreenProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  const waiting = table.phase === 'waiting'
  const inARoom = table.code !== null

  if (inARoom) {
    const stillToCome = table.seats.filter(
      (seat) => seat.kind === 'human' && seat.heldBy === null,
    ).length

    return (
      <main className="setup-page">
        <div className="setup-card">
          <h1>Waiting for everybody</h1>

          <p className="setup-lead">
            Read this out to the others. They tap "Join a game" and type it in.
          </p>

          <p className="table-code">{table.code}</p>

          <ul className="table-seats">
            {table.seats.map((seat) => (
              <li key={seat.playerId}>
                <span className="swatch" style={{ background: seat.colour }} />
                <span className="table-who">{seat.name}</span>
                <span className="table-doing">
                  {seat.kind !== 'human'
                    ? 'a computer'
                    : seat.heldBy === null
                      ? 'waiting for somebody'
                      : seat.here
                        ? 'here'
                        : 'stepped away'}
                </span>
                {seat.playerId === table.you ? (
                  <span className="table-you">you</span>
                ) : null}
              </li>
            ))}
          </ul>

          {table.trouble === null ? null : (
            <p className="table-trouble" role="alert">
              {table.trouble}
            </p>
          )}

          {!table.connected ? (
            <p className="table-note">Reaching the game...</p>
          ) : stillToCome > 0 ? (
            <p className="table-note">
              Still waiting for {stillToCome} more.
            </p>
          ) : (
            <p className="table-note">Everybody is here.</p>
          )}

          <div className="setup-buttons">
            <button
              type="button"
              className="primary"
              disabled={!waiting || stillToCome > 0}
              onClick={table.start}
            >
              Start the game
            </button>
            <button type="button" onClick={table.leave}>
              Leave
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>Play together</h1>

        <p className="setup-lead">
          One person opens a game and reads out the code. Everybody else types
          it in. You each play from your own iPad.
        </p>

        <label className="setup-field">
          Your name
          <input
            value={name}
            placeholder="Nick"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {table.trouble === null ? null : (
          <p className="table-trouble" role="alert">
            {table.trouble}
          </p>
        )}

        <section>
          <h2>Open a game</h2>
          <p className="table-note">
            It uses the players and rules you set on the new game screen. Set
            somebody to a computer there and the server plays them.
          </p>
          <button
            type="button"
            className="primary"
            disabled={table.opening}
            onClick={() => onOpen(name)}
          >
            {table.opening ? 'Opening...' : 'Open a game'}
          </button>
        </section>

        <section>
          <h2>Join a game</h2>
          <label className="setup-field">
            The code they read out
            <input
              value={code}
              placeholder="ABCD"
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
          <button
            type="button"
            disabled={code.trim().length !== 4}
            onClick={() => table.join(code, name)}
          >
            Join
          </button>
        </section>

        <div className="setup-buttons">
          <button type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </main>
  )
}
