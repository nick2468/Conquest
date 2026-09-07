import type { ReactNode } from 'react'

import type { Effect } from './effects'

/**
 * Draws what just happened, over the top of the board. Plan tasks 7.3 to 7.6.
 *
 * It decides nothing. `effects.ts` says what to draw and where, and this
 * turns that into shapes. See spec S23.
 *
 * Two rules run through all of it:
 *
 * 1. Every size is divided by how far the map is zoomed, so a parachute is
 *    the same size on the glass whether you are looking at the whole
 *    country or at one city. The army counts already work this way.
 * 2. Nothing here is allowed to matter. If it never draws, the game is
 *    exactly the same game. See spec S24.
 */

interface EffectLayerProps {
  readonly effect: Effect | null
  /**
   * Counts up once per move.
   *
   * React uses it as the key, so attacking the same border twice in a row
   * builds a new group and the animation starts again. Without it the
   * second attack would show nothing at all.
   */
  readonly moveNumber: number
  /** How much closer the view is than the whole board. */
  readonly closer: number
}

/** How far off the coast the landing craft start, on screen. */
const OUT_AT_SEA = 100

/** How high above the ground the parachutists start, on screen. */
const HIGH_UP = 95

/**
 * How big a parachute, a boat or a lorry is drawn.
 *
 * Each is drawn around 20 units wide, so this makes one about 48 across on
 * the glass. That is measured against the army counts, which are 30 across.
 * Drawn at their own size they came out around 13 and read as specks. */
const GLYPH = 2.4

export function EffectLayer({ effect, moveNumber, closer }: EffectLayerProps) {
  if (effect === null) {
    return null
  }

  /** A size on the glass, turned into a size on the map. */
  const steady = (size: number): number => size / closer

  return (
    <g key={moveNumber} className="fx" aria-hidden="true">
      {effect.kind === 'battle' ? (
        <Battle effect={effect} steady={steady} />
      ) : null}
      {effect.kind === 'parachute' ? (
        <Parachutists effect={effect} steady={steady} />
      ) : null}
      {effect.kind === 'landing' ? (
        <LandingCraft effect={effect} steady={steady} />
      ) : null}
      {effect.kind === 'convoy' ? (
        <Convoy effect={effect} steady={steady} />
      ) : null}
    </g>
  )
}

interface PartProps {
  readonly effect: Effect
  readonly steady: (size: number) => number
}

interface TravellingProps {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly from: { readonly x: number; readonly y: number }
  readonly lasting: number
  readonly delay?: number
  readonly className: string
  readonly children: ReactNode
}

/**
 * Somewhere to put one drawing that arrives from somewhere else.
 *
 * Where it sits and how big it is go on an SVG transform. The movement goes
 * on a CSS transform on the group outside it. Keeping the two apart is what
 * lets the animation move a shape without also throwing away its position,
 * because the two kinds of transform do not replace one another.
 */
function Travelling({
  x,
  y,
  size,
  from,
  lasting,
  delay = 0,
  className,
  children,
}: TravellingProps) {
  return (
    <g
      className={className}
      style={{
        // The keyframes in styles.css read these two.
        ['--fx-from-x' as string]: `${from.x}px`,
        ['--fx-from-y' as string]: `${from.y}px`,
        animationDuration: `${lasting}ms`,
        animationDelay: `${delay}ms`,
      }}
    >
      <g transform={`translate(${x} ${y}) scale(${size})`}>{children}</g>
    </g>
  )
}

/** Smoke and a flash on the border. Plan task 7.3. */
function Battle({ effect, steady }: PartProps) {
  const { x, y } = effect.at

  // The puffs sit a little apart and start a little after one another, so
  // the smoke builds up rather than arriving all at once.
  const puffs = [
    { dx: -16, dy: 3, delay: 0, r: 14 },
    { dx: 14, dy: 8, delay: 120, r: 13 },
    { dx: 2, dy: -13, delay: 240, r: 15 },
    { dx: -9, dy: -5, delay: 380, r: 11 },
    { dx: 19, dy: -9, delay: 500, r: 12 },
  ]

  return (
    <>
      {/* An orange ball with a white-hot middle. One circle on its own
          washed out to a pale blob against the tan land. */}
      <g
        className="fx-flash"
        style={{ animationDuration: `${effect.lasting * 0.5}ms` }}
      >
        <circle className="fx-fire" cx={x} cy={y} r={steady(17)} />
        <circle className="fx-hot" cx={x} cy={y} r={steady(8)} />
      </g>

      <g
        className="fx-sparks"
        style={{ animationDuration: `${effect.lasting * 0.6}ms` }}
      >
        <path
          d={sparks(steady(38))}
          transform={`translate(${x} ${y})`}
          strokeWidth={steady(3)}
        />
      </g>

      {puffs.map((puff) => (
        <g
          key={`${puff.dx},${puff.dy}`}
          className="fx-puff"
          style={{
            animationDuration: `${effect.lasting}ms`,
            animationDelay: `${puff.delay}ms`,
          }}
        >
          <circle
            cx={x + steady(puff.dx)}
            cy={y + steady(puff.dy)}
            r={steady(puff.r)}
          />
        </g>
      ))}
    </>
  )
}

/** Eight short lines shooting out from the middle of the bang. */
function sparks(reach: number): string {
  const lines: string[] = []

  for (let step = 0; step < 8; step += 1) {
    const angle = (step * Math.PI) / 4
    const inner = reach * 0.35

    lines.push(
      `M ${Math.cos(angle) * inner} ${Math.sin(angle) * inner} ` +
        `L ${Math.cos(angle) * reach} ${Math.sin(angle) * reach}`,
    )
  }

  return lines.join(' ')
}

/** Three parachutists coming down inland. Plan task 7.4. */
function Parachutists({ effect, steady }: PartProps) {
  const drops = [
    { dx: -34, dy: -10, delay: 0 },
    { dx: 30, dy: 6, delay: 90 },
    { dx: -4, dy: 26, delay: 180 },
  ]

  return (
    <>
      {drops.map((drop) => (
        <Travelling
          key={`${drop.dx},${drop.dy}`}
          className="fx-arrive fx-parachute"
          x={effect.at.x + steady(drop.dx)}
          y={effect.at.y + steady(drop.dy)}
          size={steady(GLYPH)}
          from={{ x: 0, y: -steady(HIGH_UP) }}
          lasting={effect.lasting}
          delay={drop.delay}
        >
          {/* The canopy, the cords, then the soldier hanging under them. */}
          <path className="fx-canopy" d="M -9 0 Q 0 -13 9 0 Z" />
          <path className="fx-cords" d="M -8 0 L 0 8 M 8 0 L 0 8" />
          <circle className="fx-soldier" cx={0} cy={10} r={2.6} />
        </Travelling>
      ))}
    </>
  )
}

/** Two landing craft coming in from the open sea. Plan task 7.4. */
function LandingCraft({ effect, steady }: PartProps) {
  const way = effect.comingFrom ?? { x: 0, y: 1 }
  const out = steady(OUT_AT_SEA)

  const boats = [
    { across: -26, delay: 0 },
    { across: 26, delay: 130 },
  ]

  // Across the direction of travel, so the two boats come in side by side
  // rather than one behind the other.
  const sideways = { x: -way.y, y: way.x }

  return (
    <>
      {boats.map((boat) => (
        <Travelling
          key={boat.across}
          className="fx-arrive fx-boat"
          x={effect.at.x + sideways.x * steady(boat.across)}
          y={effect.at.y + sideways.y * steady(boat.across)}
          size={steady(GLYPH)}
          from={{ x: way.x * out, y: way.y * out }}
          lasting={effect.lasting}
          delay={boat.delay}
        >
          <path className="fx-wake" d="M -13 7 L 13 7" />
          <path className="fx-hull" d="M -11 -1 L 11 -1 L 8 5 L -8 5 Z" />
          <path className="fx-cabin" d="M -3 -1 L -3 -7 L 4 -7 L 4 -1 Z" />
        </Travelling>
      ))}
    </>
  )
}

/** Lorries driving from where the armies left to where they land. Task 7.5. */
function Convoy({ effect, steady }: PartProps) {
  const start = effect.from ?? effect.at
  const away = { x: start.x - effect.at.x, y: start.y - effect.at.y }
  const facing = Math.atan2(-away.y, -away.x) * (180 / Math.PI)

  const lorries = [
    { place: 0, delay: 0 },
    { place: 1, delay: 90 },
    { place: 2, delay: 180 },
  ]

  return (
    <>
      {/* The road they take, so the move reads as a journey. */}
      <path
        className="fx-track"
        d={`M ${start.x} ${start.y} L ${effect.at.x} ${effect.at.y}`}
        strokeWidth={steady(3)}
        strokeDasharray={`${steady(7)} ${steady(6)}`}
        style={{ animationDuration: `${effect.lasting}ms` }}
      />

      {lorries.map((lorry) => (
        <Travelling
          key={lorry.place}
          className="fx-arrive fx-lorry"
          x={effect.at.x}
          y={effect.at.y}
          size={steady(GLYPH)}
          from={away}
          lasting={effect.lasting}
          delay={lorry.delay}
        >
          <g transform={`rotate(${facing})`}>
            <path className="fx-body" d="M -8 -4 L 3 -4 L 3 3 L -8 3 Z" />
            <path className="fx-cab" d="M 3 -2 L 8 -2 L 8 3 L 3 3 Z" />
            <circle className="fx-wheel" cx={-5} cy={4} r={2} />
            <circle className="fx-wheel" cx={5} cy={4} r={2} />
          </g>
        </Travelling>
      ))}
    </>
  )
}
