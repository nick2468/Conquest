import { useMemo, useState } from 'react'

import { createGame, seededRandom } from '../engine'
import type { GameMap, TerritoryId } from '../engine'
import { AUSTRALIA } from '../maps/australia'
import { AUSTRALIA_BIG } from '../maps/australia-big'
import { WORLD } from '../maps/world'
import { MapView } from '../ui/MapView'

const MAPS: readonly GameMap[] = [WORLD, AUSTRALIA_BIG, AUSTRALIA]

/**
 * A map, and nothing else.
 *
 * The map view needs a game to draw, so a throwaway one is made with two
 * players it never shows. Tap a place to look closer, tap the sea or the
 * button to see the whole map again.
 */
export function MapPage() {
  const [mapId, setMapId] = useState(MAPS[0]?.id ?? 'world')
  const [lookingAt, setLookingAt] = useState<TerritoryId | null>(null)
  const map = MAPS.find((each) => each.id === mapId) ?? WORLD

  const state = useMemo(
    () =>
      createGame({
        map,
        players: [
          { name: 'Nobody', kind: 'human' },
          { name: 'Nobody else', kind: 'human' },
        ],
        random: seededRandom(1),
      }),
    [map],
  )
  const every = useMemo(
    () => new Set<TerritoryId>(map.territories.map((each) => each.id)),
    [map],
  )

  return (
    <div className="map-page">
      <header className="map-page-bar">
        <strong>Conquest map</strong>
        <label>
          Map{' '}
          <select
            value={mapId}
            onChange={(event) => {
              setMapId(event.target.value)
              setLookingAt(null)
            }}
          >
            {MAPS.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}, {each.territories.length} places
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setLookingAt(null)}
          disabled={lookingAt === null}
        >
          Whole map
        </button>
        <a href="/">Back to the game</a>
      </header>
      <main className="map-page-board">
        <MapView
          bare
          state={state}
          highlights={{ canStart: every, canFinish: new Set() }}
          selectedId={null}
          lookingAt={lookingAt}
          onTap={(id) => setLookingAt(lookingAt === id ? null : id)}
          onTapSea={() => setLookingAt(null)}
        />
      </main>
    </div>
  )
}
