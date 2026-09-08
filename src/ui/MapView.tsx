import { useMemo } from 'react'

import type { GameState, TerritoryDefinition, TerritoryId } from '../engine'
import { cornersOf as cornersOfShape, edgesBetween, isWithin } from '../maps/shapes'
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
  /**
   * Somebody tapped the sea rather than a place.
   *
   * Nick asked for this: stepping back out to the whole map should not
   * need the button. Tapping past the edge of the land is what a person
   * reaches for, and on an iPad it is a much bigger target than a button
   * in the corner.
   */
  readonly onTapSea?: (() => void) | undefined
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
  onTapSea,
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

  /** How big a name is drawn. Small, so more of them fit. */
  const nameSize = closeUp ? 13 : 10.5

  /**
   * The full name where there is room for it, the short one where not.
   *
   * Nick: "spell out the country names where there is plenty of room, use
   * a small smaller font size to help." Close up there is always room. On
   * the whole board it depends on the place: Brazil has room for its name
   * and Iceland has not.
   *
   * See fullNameFits above for how room is decided.
   */
  const nameFor = (territory: TerritoryDefinition): string =>
    closeUp || fullNameFits.has(territory.id)
      ? territory.name
      : territory.shortName

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

  /**
   * All the land, as one shape.
   *
   * Drawn UNDER the places and given a thick soft edge, that edge shows
   * only around the outside, because the places drawn on top cover the
   * rest of it. Nick asked for "thick fuzzy edges around the continents",
   * and this is how you get one without working out where a continent ends,
   * which is real work for no gain.
   *
   * ALL the land in one path, not one path per region. Per region was the
   * first attempt and it was wrong: it put a dark band around every state
   * of Australia, because the states touch. One path gives each separate
   * piece of land its own coast, so the six continents each get one and
   * Australia gets one around the country rather than seven inside it.
   */
  const withIslands = (each: TerritoryDefinition): string =>
    [each.shape, ...(each.islands ?? [])].join(' ')
  const allTheLand = [
    ...map.territories.map(withIslands),
    ...(map.scenery ?? []),
  ].join(' ')

  /** The land of one region, as one shape, for its own heavier outline. */
  const landIn = (regionId: string): string =>
    map.territories
      .filter((each) => each.regionId === regionId)
      .map(withIslands)
      .join(' ')

  /**
   * Which places have room for their full name on the whole board.
   *
   * Nick's point: "Indonesia can be properly labelled because there is
   * plenty of empty sea space for the name to appear." So the test is not
   * whether the name fits inside its own place. It is whether the name
   * lands on ANOTHER place, or on another name. Sea is fine.
   *
   * A name is about half the font size per letter. Seven points along it
   * are tried against every other place, and its box is kept clear of
   * every other count and name. Worked out once, because it depends only
   * on the map.
   */
  const fullNameFits = useMemo(() => {
    const size = 10.5
    const shapes = map.territories.map((each) => ({
      id: each.id,
      corners: cornersOfShape(each.shape),
    }))
    const fits = new Set<TerritoryId>()

    for (const territory of map.territories) {
      const width = territory.name.length * size * 0.5
      const y = territory.labelAt.y + 18
      const left = territory.labelAt.x - width / 2
      let clear = true

      for (let step = 0; step <= 6 && clear; step += 1) {
        const point: readonly [number, number] = [left + (width * step) / 6, y]

        for (const other of shapes) {
          if (other.id !== territory.id && isWithin(point, other.corners)) {
            clear = false
            break
          }
        }
      }

      for (const other of map.territories) {
        if (other.id === territory.id || !clear) {
          continue
        }

        const acrossGap = Math.abs(other.labelAt.x - territory.labelAt.x)
        const downGap = Math.abs(other.labelAt.y - territory.labelAt.y)

        // Their count, or their own name just under it, would collide.
        if (acrossGap < width / 2 + 12 && downGap < 30) {
          clear = false
        }
      }

      if (clear) {
        fits.add(territory.id)
      }
    }

    return fits
  }, [map])

  /**
   * Just the borders INSIDE a region, as one path.
   *
   * Nick: "don't double up borders where an inner border runs alongside a
   * continent border, keep just the continent border." So the places
   * themselves are drawn with no line at all, the heavy line around a
   * region comes from the shape underneath, and the light line between two
   * places in the same region comes from here. Each border is drawn once,
   * by whichever layer owns it.
   *
   * Worked out once per map. It costs a moment and the map does not change
   * while a game is played.
   */
  const insideBorders = useMemo(() => {
    const paths: string[] = []

    for (const region of map.regions) {
      const shapes = map.territories
        .filter((each) => each.regionId === region.id)
        .map((each) => cornersOfShape(each.shape))

      for (const [from, to] of edgesBetween(shapes)) {
        paths.push(`M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`)
      }
    }

    return paths.join(' ')
  }, [map])

  return (
    <svg
      className="map"
      viewBox={viewBox}
      role="group"
      aria-label={`The ${map.name} board`}
      onPointerDown={(event) => {
        // Only when the tap landed on the board itself. A tap on a place
        // reaches this too, on its way up, and that one is not the sea.
        // Everything drawn between, the coast and the region lines, is set
        // to ignore taps so it cannot get in the way.
        if (event.target === event.currentTarget) {
          onTapSea?.()
        }
      }}
    >
      <defs>
        {/*
          The fuzzy edge. Grow the shape, blur what is left, and put the
          shape back on top. What shows is a soft band the same colour as
          the continent, spread around its coast.
        */}
        <filter id="grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={0.19 * closer}
            numOctaves={3}
            seed={7}
            result="rough"
          />
          <feColorMatrix in="rough" type="saturate" values="0" result="grey" />
          <feComponentTransfer in="grey" result="faint">
            <feFuncA type="linear" slope="0.9" intercept="-0.3" />
          </feComponentTransfer>
          {/* Only over the land, never over the sea. */}
          <feComposite in="faint" in2="SourceAlpha" operator="in" />
        </filter>

        <filter id="coast" x="-12%" y="-12%" width="124%" height="124%">
          <feMorphology
            in="SourceAlpha"
            operator="dilate"
            radius={steady(3.5)}
            result="wider"
          />
          <feGaussianBlur in="wider" stdDeviation={steady(3)} result="soft" />
          <feColorMatrix
            in="soft"
            type="matrix"
            values="0 0 0 0 0.12  0 0 0 0 0.14  0 0 0 0 0.11  0 0 0 0.55 0"
            result="edge"
          />
          <feMerge>
            <feMergeNode in="edge" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/*
        The coast. One shape, so each separate piece of land gets one.

        Filled the colour of the SEA on purpose, not the colour of land. A
        territory you cannot act on is drawn at 55% so the ones you can act
        on stand out, and anything solid underneath shows through it. A grey
        land colour here turned every idle place muddy. The soft edge comes
        from the SHAPE, not from what it is filled with, so filling it with
        the sea costs nothing.
      */}
      <path className="coast" d={allTheLand} filter="url(#coast)" />

      {/*
        Three weights of line, heaviest first. The coast above, then a
        region, then a place. Each is drawn UNDER the next, so a heavy line
        shows only where nothing heavier covers it: a region's line shows
        around the region and not through the middle of it.

        Without this the states of Australia all but disappeared, because
        the only line left was the thin one between two places, and a state
        is the thing the bonus is paid for.
      */}
      {map.regions.map((region) => (
        <path
          key={region.id}
          className="region-edge"
          d={landIn(region.id)}
          // Not filled, for the same reason the coast is not filled with
          // land: a solid colour under a place drawn at 55% shows through
          // it. Only the line is wanted, and half of it is covered by the
          // places on top, which is what makes it show around a region and
          // not through the middle of one.
          fill="none"
          stroke={region.outline}
          strokeWidth={steady(4)}
          strokeLinejoin="round"
        />
      ))}

      {/* Land that belongs to nobody, drawn once and never tapped. */}
      {map.scenery && map.scenery.length > 0 && (
        <path className="scenery" d={map.scenery.join(' ')} />
      )}

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
            d={withIslands(territory)}
            fill={colourOf(state.territories[territory.id]?.ownerId ?? null)}
            // A quiet line between two places in the same continent. The
            // heavy line belongs to the coast, drawn underneath, and two
            // heavy lines competing made the map look like a grid.
            // No line of its own. See insideBorders above: a border is
            // drawn once, by whichever layer owns it. The dashes and the
            // heavy outline of a place being chosen are highlights rather
            // than borders, and those still come from here.
            stroke={role === 'idle' ? 'none' : outlineOf(territory.regionId)}
            strokeWidth={steady(role === 'idle' ? 0 : 3)}
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

      {/*
        A mild grain over the land, so it does not read as flat paint. The
        roughness is scaled by how far the map is zoomed, which keeps the
        grain the same size on the glass however close the view is.
      */}
      <path className="texture" d={allTheLand} filter="url(#grain)" />

      {/* The light line between two places in the same region. */}
      <path
        className="inside-border"
        d={insideBorders}
        strokeWidth={steady(0.45)}
      />

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
                strokeWidth={steady(1.5)}
              />
            ) : null}

            <circle
              cx={territory.labelAt.x}
              cy={territory.labelAt.y}
              r={steady(9)}
              fill={fill}
              stroke="#2b2a26"
              strokeWidth={steady(1.5)}
            />
            <text
              x={territory.labelAt.x}
              y={territory.labelAt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={steady(10.5)}
              fontWeight={700}
              fill={readableOn(fill)}
            >
              {armies}
            </text>
            <text
              className="territory-name"
              x={territory.labelAt.x}
              y={territory.labelAt.y + steady(18)}
              textAnchor="middle"
              fontSize={steady(nameSize)}
            >
              {nameFor(territory)}
            </text>
          </g>
        )
      })}

      {/* Last, so smoke is never drawn under a shape or a count. */}
      <EffectLayer effect={effect} moveNumber={moveNumber} closer={closer} />
    </svg>
  )
}
