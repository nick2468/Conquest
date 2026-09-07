import { useRef } from 'react'

import type { DraftPlace, MapDraft } from '../maps/format'
import type { Corner } from '../maps/shapes'
import { pathFrom } from '../maps/shapes'
import { cornersIn, snapped } from './edits'

/**
 * The map, with handles you can take hold of. Plan task 5.9.
 *
 * Only the chosen place shows its handles. Thirty-eight places showing
 * every corner at once is a field of dots with a map somewhere underneath.
 */

interface EditorMapProps {
  readonly draft: MapDraft
  readonly chosen: string | null
  readonly chosenCorner: number | null
  readonly onChoosePlace: (id: string) => void
  readonly onChooseCorner: (at: number | null) => void
  readonly onMoveCorner: (at: number, to: Corner) => void
  readonly onInsertCorner: (after: number, at: Corner) => void
  readonly onMoveLabel: (to: Corner) => void
}

/** Where a pointer is, in the map's own numbers rather than the screen's. */
function pointIn(svg: SVGSVGElement, clientX: number, clientY: number): Corner {
  const place = svg.createSVGPoint()
  place.x = clientX
  place.y = clientY

  const screen = svg.getScreenCTM()

  if (screen === null) {
    return [0, 0]
  }

  const onMap = place.matrixTransform(screen.inverse())

  // Whole numbers. Every map we ship is drawn in them, they read plainly in
  // a file, and a corner at 412.3847 helps nobody.
  return [Math.round(onMap.x), Math.round(onMap.y)]
}

function middleOf(one: Corner, two: Corner): Corner {
  return [Math.round((one[0] + two[0]) / 2), Math.round((one[1] + two[1]) / 2)]
}

export function EditorMap({
  draft,
  chosen,
  chosenCorner,
  onChoosePlace,
  onChooseCorner,
  onMoveCorner,
  onInsertCorner,
  onMoveLabel,
}: EditorMapProps) {
  const board = useRef<SVGSVGElement>(null)

  const place = draft.places.find((each) => each.id === chosen) ?? null
  const elsewhere = chosen === null ? [] : cornersIn(draft, chosen)

  const [left, top, width, height] = draft.viewBox
    .trim()
    .split(/\s+/)
    .map(Number) as [number, number, number, number]

  // Handles keep their size on the glass however wide the map is drawn.
  const size = (across: number): number => (across * width) / 800

  const colourOf = (each: DraftPlace): string =>
    draft.regions.find((region) => region.id === each.region)?.outline ??
    '#cfcabb'

  /** Drag a handle, snapping onto any corner already on the map. */
  const dragging =
    (move: (to: Corner) => void) =>
    (event: React.PointerEvent<SVGElement>): void => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      const follow = (moved: PointerEvent): void => {
        if (board.current === null) {
          return
        }

        move(
          snapped(
            pointIn(board.current, moved.clientX, moved.clientY),
            elsewhere,
          ),
        )
      }

      const stop = (): void => {
        window.removeEventListener('pointermove', follow)
        window.removeEventListener('pointerup', stop)
      }

      window.addEventListener('pointermove', follow)
      window.addEventListener('pointerup', stop)
    }

  return (
    <svg
      ref={board}
      className="editor-map"
      viewBox={draft.viewBox}
      role="group"
      aria-label={`${draft.name}, being drawn`}
    >
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        className="editor-sea"
      />

      {draft.places.map((each) => (
        <path
          key={each.id}
          d={pathFrom(each.corners)}
          className={
            each.id === chosen ? 'editor-place editor-chosen' : 'editor-place'
          }
          data-place={each.id}
          fill={colourOf(each)}
          strokeWidth={size(each.id === chosen ? 4 : 1.5)}
          onPointerDown={() => {
            onChoosePlace(each.id)
            onChooseCorner(null)
          }}
        >
          <title>{each.name}</title>
        </path>
      ))}

      {draft.places.map((each) => (
        <text
          key={each.id}
          x={each.labelAt[0]}
          y={each.labelAt[1]}
          className="editor-name"
          textAnchor="middle"
          fontSize={size(14)}
        >
          {each.shortName}
        </text>
      ))}

      {place === null ? null : (
        <g className="editor-handles">
          {/* Halfway along each side: press one to put a corner there. */}
          {place.corners.map((corner, at) => {
            const next = place.corners[
              (at + 1) % place.corners.length
            ] as Corner
            const half = middleOf(corner, next)

            return (
              <circle
                key={`add-${at}`}
                cx={half[0]}
                cy={half[1]}
                r={size(5)}
                className="editor-add"
                strokeWidth={size(1.5)}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onInsertCorner(at, half)
                  onChooseCorner(at + 1)
                }}
              >
                <title>Put a corner here</title>
              </circle>
            )
          })}

          {place.corners.map((corner, at) => (
            <circle
              key={`corner-${at}`}
              cx={corner[0]}
              cy={corner[1]}
              r={size(at === chosenCorner ? 9 : 7)}
              className={
                at === chosenCorner
                  ? 'editor-corner editor-corner-chosen'
                  : 'editor-corner'
              }
              strokeWidth={size(2)}
              onPointerDown={(event) => {
                onChooseCorner(at)
                dragging((to) => onMoveCorner(at, to))(event)
              }}
            >
              <title>{`Corner ${at + 1} of ${place.corners.length}`}</title>
            </circle>
          ))}

          {/* Where the army count sits. */}
          <g
            className="editor-label"
            onPointerDown={dragging((to) => onMoveLabel(to))}
          >
            <line
              x1={place.labelAt[0]}
              y1={place.labelAt[1]}
              x2={place.corners[0]?.[0] ?? place.labelAt[0]}
              y2={place.corners[0]?.[1] ?? place.labelAt[1]}
              strokeWidth={size(1)}
            />
            <rect
              x={place.labelAt[0] - size(9)}
              y={place.labelAt[1] - size(9)}
              width={size(18)}
              height={size(18)}
              rx={size(4)}
              strokeWidth={size(2)}
            />
            <title>Where the army count is drawn</title>
          </g>
        </g>
      )}
    </svg>
  )
}
