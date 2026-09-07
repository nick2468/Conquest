import type { GameState, TerritoryDefinition, TerritoryId } from '../engine'
import { EffectLayer } from './EffectLayer'
import type { Effect } from './effects'
import type { Highlights } from './taps'
import { cornersOf, magnification, middleOf, viewBoxFor } from './zoom'

/**
 * The board on screen.
 *
 * Each territory is one SVG path, so the browser owns the shapes and works
 * out which one a finger landed on. See spec 11.1.
 *
 * Nothing here decides anything. It draws the game state it is handed, and
 * reports taps. See spec S14.
 */

const UNOWNED = '#cfcabb'

/** Black or white text, whichever can be read on this background. */
function readableOn(colour: string): string {
  const hex = colour.replace('#', '')
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)

  // The green channel carries most of what the eye reads as brightness.
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000

  return brightness > 140 ? '#1d1c19' : '#ffffff'
}

interface MapViewProps {
  readonly state: GameState
  readonly highlights: Highlights
  readonly selectedId: TerritoryId | null
  readonly onTap: (territoryId: TerritoryId) => void
  /**
   * The place being looked at closely, or null for the whole board.
   *
   * When it is set the map frames that place and everywhere it borders, and
   * writes full names rather than short ones, because there is room.
   */
  readonly lookingAt: TerritoryId | null
  /**
   * Territories smaller than this get their count drawn beside them, with
   * a line pointing at them. Measured as the box the shape fits in.
   */
  readonly smallTerritoryArea?: number
  /** What just happened, drawn over the board. Null for nothing. */
  readonly effect?: Effect | null
  /** Counts up once per move, so the same move twice animates twice. */
  readonly moveNumber?: number
}

/**
 * Roughly how big a territory is on screen.
 *
 * The two islands are smaller than the circle that holds their army count,
 * so the count has to sit beside them rather than on top. This measures the
 * box the shape fits in, which is close enough to decide that.
 */
function shapeSize(territory: TerritoryDefinition): number {
  const corners = cornersOf(territory)

  if (corners.length === 0) {
    return 0
  }

  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)

  return (
    (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  )
}

export function MapView({
  state,
  highlights,
  selectedId,
  onTap,
  lookingAt,
  smallTerritoryArea = 400,
  effect = null,
  moveNumber = 0,
}: MapViewProps) {
  const { map } = state
  const viewBox = viewBoxFor(map, lookingAt)
  const closeUp = lookingAt !== null

  /**
   * Labels are drawn in map units, so zooming in makes them grow with the
   * land. Dividing by how far the map is zoomed keeps a count the same size
   * on the glass however close the view is, which is what a person expects.
   */
  const closer = magnification(map, lookingAt)
  const steady = (size: number): number => size / closer

  const colourOf = (ownerId: string | null): string => {
    if (ownerId === null) {
      return UNOWNED
    }

    return (
      state.players.find((player) => player.id === ownerId)?.colour ?? UNOWNED
    )
  }

  const outlineOf = (regionId: string): string =>
    map.regions.find((region) => region.id === regionId)?.outline ?? '#000000'

  /** What this territory means to the tap that is half way through. */
  const roleOf = (territoryId: TerritoryId): string => {
    if (territoryId === selectedId) {
      return 'chosen'
    }

    if (highlights.canFinish.has(territoryId)) {
      return 'target'
    }

    if (highlights.canStart.has(territoryId)) {
      return 'ready'
    }

    return 'idle'
  }

  return (
    <svg
      className="map"
      viewBox={viewBox}
      role="group"
      aria-label={`The ${map.name} board`}
    >
      {/* Every shape first, so no territory can cover another one's count. */}
      {map.territories.map((territory) => {
        const role = roleOf(territory.id)
        const canTap = role !== 'idle'

        return (
          <path
            key={territory.id}
            className={`territory territory-${role}`}
            data-territory={territory.id}
            data-role={role}
            d={territory.shape}
            fill={colourOf(state.territories[territory.id]?.ownerId ?? null)}
            stroke={outlineOf(territory.regionId)}
            strokeWidth={steady(3)}
            strokeLinejoin="round"
            role="button"
            tabIndex={canTap ? 0 : -1}
            aria-disabled={!canTap}
            aria-label={`${territory.name}, ${
              state.territories[territory.id]?.armies ?? 0
            } armies`}
            // A pointer event covers a finger, a mouse and a stylus at once.
            // See spec 11.3.
            onPointerDown={() => onTap(territory.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onTap(territory.id)
              }
            }}
          >
            <title>{territory.name}</title>
          </path>
        )
      })}

      {map.territories.map((territory) => {
        const armies = state.territories[territory.id]?.armies ?? 0
        const isSmall = shapeSize(territory) < smallTerritoryArea
        const fill = colourOf(state.territories[territory.id]?.ownerId ?? null)

        return (
          <g key={territory.id} className="territory-label">
            {isSmall ? (
              // The line runs from the count TOWARDS the territory, not
              // straight down. A label can then be put anywhere there is
              // room, which on a crowded map is most of the problem.
              <line
                x1={territory.labelAt.x}
                y1={territory.labelAt.y}
                x2={middleOf(territory).x}
                y2={middleOf(territory).y}
                className="territory-leader"
                strokeWidth={steady(2)}
              />
            ) : null}

            <circle
              cx={territory.labelAt.x}
              cy={territory.labelAt.y}
              r={steady(15)}
              fill={fill}
              stroke="#2b2a26"
              strokeWidth={steady(2)}
            />
            <text
              x={territory.labelAt.x}
              y={territory.labelAt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={steady(16)}
              fontWeight={700}
              fill={readableOn(fill)}
            >
              {armies}
            </text>
            <text
              className="territory-name"
              x={territory.labelAt.x}
              y={territory.labelAt.y + steady(30)}
              textAnchor="middle"
              fontSize={steady(closeUp ? 17 : 15)}
            >
              {closeUp ? territory.name : territory.shortName}
            </text>
          </g>
        )
      })}

      {/* Last, so smoke is never drawn under a shape or a count. */}
      <EffectLayer effect={effect} moveNumber={moveNumber} closer={closer} />
    </svg>
  )
}
