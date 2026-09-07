import { useState } from 'react'

import { PLAYER_COLOURS } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import { WORLD } from '../maps/world'
import type { MapDraft } from '../maps/format'
import { fromDraft, readMap, toDraft, writeDraft } from '../maps/format'
import type { MapProblem } from '../maps/validate'
import { validateMap } from '../maps/validate'
import { EditorMap } from './EditorMap'
import {
  addedPlace,
  addedRegion,
  bordersFromShapes,
  changedPlace,
  changedRegion,
  freeId,
  insertedCorner,
  movedCorner,
  movedLabel,
  removedCorner,
  removedPlace,
  removedRegion,
  squareAt,
} from './edits'

/**
 * The map editor. Plan task 5.9.
 *
 * A map of your own, drawn rather than typed. It writes exactly the same
 * file the game reads, and shows the same faults the game would, beside the
 * drawing rather than after it.
 *
 * It never starts from a blank page. A map begins as one of the two we
 * ship, or as a file you already have, because a blank page is where a
 * project like this dies.
 */

/** How many steps back you can take. */
const REMEMBER_STEPS = 40

/**
 * Where to drop a new place.
 *
 * Near the top left rather than in the middle. The middle of a map is
 * almost always land, so a new place landed on top of an old one and
 * greeted a beginner with three faults it had caused itself. A corner is
 * usually sea. The faults still say so if it is not.
 */
function roomFor(viewBox: string): [number, number] {
  const [left, top, width, height] = viewBox
    .trim()
    .split(/\s+/)
    .map(Number) as [number, number, number, number]

  return [Math.round(left + width * 0.12), Math.round(top + height * 0.12)]
}

export function EditorApp() {
  const [draft, setDraft] = useState<MapDraft>(() => toDraft(WORLD))
  const [steps, setSteps] = useState<MapDraft[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [chosenCorner, setChosenCorner] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [fileFaults, setFileFaults] = useState<readonly MapProblem[]>([])

  const place = draft.places.find((each) => each.id === chosen) ?? null
  const faults = validateMap(fromDraft(draft))

  /** Make a change, keeping the step before it so it can be undone. */
  const change = (next: MapDraft): void => {
    setSteps((before) => [draft, ...before].slice(0, REMEMBER_STEPS))
    setDraft(next)
    setNote(null)
  }

  const undo = (): void => {
    const [last, ...rest] = steps

    if (last === undefined) {
      return
    }

    setDraft(last)
    setSteps(rest)
    setNote(null)
  }

  const startFrom = (from: MapDraft): void => {
    change(from)
    setChosen(null)
    setChosenCorner(null)
    setFileFaults([])
  }

  const openFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) {
      return
    }

    // The rules are NOT checked here on purpose. A map with an overlap in
    // it is exactly the map somebody wants to open in an editor.
    const read = readMap(await file.text(), { checkRules: false })

    if (read.problems !== undefined) {
      setFileFaults(read.problems)
      return
    }

    startFrom(toDraft(read.map))
  }

  const saveFile = (): void => {
    const written = new Blob([writeDraft(draft)], { type: 'application/json' })
    const address = URL.createObjectURL(written)
    const link = document.createElement('a')

    link.href = address
    link.download = `${draft.id}.conquest.json`
    link.click()
    URL.revokeObjectURL(address)
  }

  /** Hand the map straight to the game, without a trip through a file. */
  const sendToTheGame = (): void => {
    try {
      window.localStorage.setItem('conquest.map', writeDraft(draft))
      setNote(
        faults.length === 0
          ? 'Sent. Open the game and pick it in the map list.'
          : `Sent, but it has ${faults.length} faults and the game will ` +
            `refuse it until they are put right.`,
      )
    } catch {
      setNote('This browser will not let the map be saved.')
    }
  }

  const addPlace = (): void => {
    const id = freeId(
      draft.places.map((each) => each.id),
      'new place',
    )

    change(
      addedPlace(draft, {
        id,
        name: 'New place',
        shortName: 'NEW',
        region: draft.regions[0]?.id ?? '',
        borders: [],
        corners: squareAt(roomFor(draft.viewBox), 60),
        labelAt: roomFor(draft.viewBox),
      }),
    )
    setChosen(id)
    setChosenCorner(null)
  }

  const addRegion = (): void => {
    const id = freeId(
      draft.regions.map((each) => each.id),
      'new region',
    )

    change(
      addedRegion(draft, {
        id,
        name: 'New region',
        bonus: 2,
        outline:
          PLAYER_COLOURS[draft.regions.length % PLAYER_COLOURS.length] ??
          '#4a4a52',
      }),
    )
  }

  const workOutBorders = (): void => {
    const { draft: next, added } = bordersFromShapes(draft)

    change(next)
    setNote(
      added === 0
        ? 'Every place that touches another already had the border.'
        : `Added ${added} border${added === 1 ? '' : 's'} where places touch. ` +
          `A crossing over water is not in the shapes, so add those yourself.`,
    )
  }

  return (
    <main className="editor-page">
      <header className="editor-header">
        <h1>Conquest map editor</h1>
        <div className="editor-actions">
          <button type="button" onClick={undo} disabled={steps.length === 0}>
            Undo
          </button>
          <button type="button" onClick={saveFile}>
            Save to a file
          </button>
          <button type="button" className="primary" onClick={sendToTheGame}>
            Send to the game
          </button>
          <a href="/">Back to the game</a>
        </div>
      </header>

      <EditorMap
        draft={draft}
        chosen={chosen}
        chosenCorner={chosenCorner}
        onChoosePlace={setChosen}
        onChooseCorner={setChosenCorner}
        onMoveCorner={(at, to) =>
          chosen === null ? undefined : change(movedCorner(draft, chosen, at, to))
        }
        onInsertCorner={(after, at) =>
          chosen === null
            ? undefined
            : change(insertedCorner(draft, chosen, after, at))
        }
        onMoveLabel={(to) =>
          chosen === null ? undefined : change(movedLabel(draft, chosen, to))
        }
      />

      <div className="editor-side">
        <section>
          <h2>The map</h2>
          <label className="editor-field">
            Name
            <input
              value={draft.name}
              onChange={(event) =>
                change({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="editor-field">
            Id
            <input
              value={draft.id}
              onChange={(event) => change({ ...draft, id: event.target.value })}
            />
          </label>

          <div className="editor-buttons">
            <button type="button" onClick={() => startFrom(toDraft(WORLD))}>
              Start from the world
            </button>
            <button
              type="button"
              onClick={() => startFrom(toDraft(AUSTRALIA_BIG))}
            >
              Start from Australia in detail
            </button>
            <button type="button" onClick={() => startFrom(toDraft(AUSTRALIA))}>
              Start from the small Australia
            </button>
          </div>

          <label className="editor-field">
            Open a map file
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                void openFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>

          {fileFaults.length === 0 ? null : (
            <div className="editor-faults" role="alert">
              <p>That file could not be opened:</p>
              <ul>
                {fileFaults.slice(0, 6).map((fault) => (
                  <li key={fault.message}>{fault.message}</li>
                ))}
              </ul>
            </div>
          )}

          {note === null ? null : <p className="editor-note">{note}</p>}
        </section>

        <section>
          <h2>Places</h2>
          <div className="editor-buttons">
            <button type="button" onClick={addPlace}>
              Add a place
            </button>
            <button type="button" onClick={workOutBorders}>
              Add borders where places touch
            </button>
          </div>

          {place === null ? (
            <p className="editor-hint">
              Press a place on the map to change it. Its corners appear, and
              you can drag them. A corner dropped near another one snaps onto
              it exactly, which is what keeps a border tidy.
            </p>
          ) : (
            <>
              <label className="editor-field">
                Name
                <input
                  value={place.name}
                  onChange={(event) =>
                    change(
                      changedPlace(draft, place.id, { name: event.target.value }),
                    )
                  }
                />
              </label>

              <label className="editor-field">
                Short name
                <input
                  value={place.shortName}
                  onChange={(event) =>
                    change(
                      changedPlace(draft, place.id, {
                        shortName: event.target.value,
                      }),
                    )
                  }
                />
              </label>

              <label className="editor-field">
                Region
                <select
                  value={place.region}
                  onChange={(event) =>
                    change(
                      changedPlace(draft, place.id, {
                        region: event.target.value,
                      }),
                    )
                  }
                >
                  {draft.regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="editor-tick">
                <input
                  type="checkbox"
                  checked={place.isIsland === true}
                  onChange={(event) =>
                    change(
                      changedPlace(draft, place.id, {
                        isIsland: event.target.checked,
                      }),
                    )
                  }
                />
                Only reachable by sea
              </label>

              <label className="editor-field">
                Drawn on top of
                <select
                  value={place.drawnOver ?? ''}
                  onChange={(event) =>
                    change(
                      changedPlace(draft, place.id, {
                        drawnOver: event.target.value,
                      }),
                    )
                  }
                >
                  <option value="">Nothing, it stands on its own</option>
                  {draft.places
                    .filter((each) => each.id !== place.id)
                    .map((each) => (
                      <option key={each.id} value={each.id}>
                        {each.name}
                      </option>
                    ))}
                </select>
              </label>

              <h3>You can attack from here to</h3>
              <ul className="editor-borders">
                {draft.places
                  .filter((each) => each.id !== place.id)
                  .map((each) => {
                    const joined = place.borders.includes(each.id)

                    return (
                      <li key={each.id}>
                        <label className="editor-tick">
                          <input
                            type="checkbox"
                            checked={joined}
                            onChange={() => {
                              // Both ways at once. A border named on one
                              // side only is the mistake people make most.
                              const one = changedPlace(draft, place.id, {
                                borders: joined
                                  ? place.borders.filter((id) => id !== each.id)
                                  : [...place.borders, each.id],
                              })

                              change(
                                changedPlace(one, each.id, {
                                  borders: joined
                                    ? each.borders.filter(
                                        (id) => id !== place.id,
                                      )
                                    : [...each.borders, place.id],
                                }),
                              )
                            }}
                          />
                          {each.name}
                        </label>
                      </li>
                    )
                  })}
              </ul>

              <div className="editor-buttons">
                <button
                  type="button"
                  disabled={
                    chosenCorner === null || place.corners.length <= 3
                  }
                  onClick={() => {
                    if (chosenCorner !== null) {
                      change(removedCorner(draft, place.id, chosenCorner))
                      setChosenCorner(null)
                    }
                  }}
                >
                  {chosenCorner === null
                    ? 'Press a corner to remove it'
                    : `Remove corner ${chosenCorner + 1}`}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    change(removedPlace(draft, place.id))
                    setChosen(null)
                    setChosenCorner(null)
                  }}
                >
                  Delete {place.name}
                </button>
              </div>
            </>
          )}
        </section>

        <section>
          <h2>Regions</h2>
          <button type="button" onClick={addRegion}>
            Add a region
          </button>

          <ul className="editor-regions">
            {draft.regions.map((region) => (
              <li key={region.id}>
                <input
                  value={region.name}
                  aria-label={`Name of ${region.name}`}
                  onChange={(event) =>
                    change(
                      changedRegion(draft, region.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  value={region.bonus}
                  aria-label={`Bonus for ${region.name}`}
                  onChange={(event) =>
                    change(
                      changedRegion(draft, region.id, {
                        bonus: Math.max(0, Number(event.target.value) || 0),
                      }),
                    )
                  }
                />
                <input
                  type="color"
                  value={region.outline}
                  aria-label={`Colour of ${region.name}`}
                  onChange={(event) =>
                    change(
                      changedRegion(draft, region.id, {
                        outline: event.target.value,
                      }),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove ${region.name}`}
                  disabled={draft.places.some(
                    (each) => each.region === region.id,
                  )}
                  onClick={() => change(removedRegion(draft, region.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>
            What is wrong{' '}
            <span className="editor-count">{faults.length}</span>
          </h2>

          {faults.length === 0 ? (
            <p className="editor-good">
              Nothing. This map can be played.
            </p>
          ) : (
            <ul className="editor-faults-list">
              {faults.slice(0, 20).map((fault) => (
                <li key={fault.message}>{fault.message}</li>
              ))}
              {faults.length > 20 ? (
                <li>and {faults.length - 20} more.</li>
              ) : null}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
