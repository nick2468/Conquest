import type { GameState, TerritoryDefinition } from '../engine'

/**
 * The board on screen.
 *
 * Each territory is one SVG path, so the browser owns the shapes and works
 * out which one a finger landed on. See spec 11.1.
 *
 * Nothing here decides anything. It draws the game state it is handed and
 * nothing else. See spec S14.
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
  /**
   * Territories smaller than this get their count drawn beside them, with
   * a line pointing at them. Measured as the box the shape fits in.
   */
  readonly smallTerritoryArea?: number
}

/**
 * Roughly how big a territory is on screen.
 *
 * The three islands are smaller than the circle that holds their army
 * count, so the count has to sit beside them rather than on top. This
 * measures the box the shape fits in, which is close enough to decide that.
 */
function shapeSize(territory: TerritoryDefinition): number {
  const numbers = (territory.shape.match(/[\d.]+/g) ?? []).map(Number)
  const xs = numbers.filter((_unused, index) => index % 2 === 0)
  const ys = numbers.filter((_unused, index) => index % 2 === 1)

  if (xs.length === 0 || ys.length === 0) {
    return 0
  }

  return (
    (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  )
}

export function MapView({ state, smallTerritoryArea = 400 }: MapViewProps) {
  const { map } = state

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

  return (
    <svg
      className="map"
      viewBox={map.viewBox}
      role="img"
      aria-label={`The ${map.name} board`}
    >
      {/* Every shape first, so no territory can cover another one's count. */}
      {map.territories.map((territory) => (
        <path
          key={territory.id}
          d={territory.shape}
          fill={colourOf(state.territories[territory.id]?.ownerId ?? null)}
          stroke={outlineOf(territory.regionId)}
          strokeWidth={3}
          strokeLinejoin="round"
        >
          <title>{territory.name}</title>
        </path>
      ))}

      {map.territories.map((territory) => {
        const armies = state.territories[territory.id]?.armies ?? 0
        const isSmall = shapeSize(territory) < smallTerritoryArea
        const fill = colourOf(state.territories[territory.id]?.ownerId ?? null)

        return (
          <g key={territory.id} className="territory-label">
            {isSmall ? (
              <line
                x1={territory.labelAt.x}
                y1={territory.labelAt.y + 12}
                x2={territory.labelAt.x}
                y2={territory.labelAt.y + 24}
                stroke="#6b675d"
                strokeWidth={2}
              />
            ) : null}

            <circle
              cx={territory.labelAt.x}
              cy={territory.labelAt.y}
              r={15}
              fill={fill}
              stroke="#2b2a26"
              strokeWidth={2}
            />
            <text
              x={territory.labelAt.x}
              y={territory.labelAt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={16}
              fontWeight={700}
              fill={readableOn(fill)}
            >
              {armies}
            </text>
            <text
              x={territory.labelAt.x}
              y={territory.labelAt.y + (isSmall ? -22 : 30)}
              textAnchor="middle"
              fontSize={15}
              fill="#4c4941"
            >
              {territory.shortName}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
