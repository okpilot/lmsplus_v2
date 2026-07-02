// Pure artwork for the RWY 27/09 left-hand traffic pattern `diagram_label`
// question. Renders ONLY the schematic (runway + circuit + direction arrows) —
// no drop-boxes and no labels-in-boxes, those overlay at runtime from the
// delivered `diagram_config.zones`. No 'use client' directive: this component
// has no interactivity and is safe to render on the server.
//
// Coordinate space: a 0-100 viewBox mapped 1:1 from the [0,1] fractions in
// `rwy-2709-layout.ts` (multiply every fraction by 100). Importing the shared
// layout here — instead of hand-copying coordinates — is what keeps this
// artwork and the seeded `RWY_2709_ZONES` boxes consistent by construction.

import { type PatternPoint, RWY_2709_PATH_POINTS, RWY_2709_RUNWAY } from './rwy-2709-layout'

const SCALE = 100

function scaled(p: PatternPoint) {
  return { x: p.x * SCALE, y: p.y * SCALE }
}

type DirectionArrowProps = Readonly<{
  center: PatternPoint
  /** Degrees, SVG convention: 0 = pointing +x (east), 90 = pointing +y (south). */
  rotation: number
}>

/** A small filled triangle marking a leg's direction of travel. */
function DirectionArrow({ center, rotation }: DirectionArrowProps) {
  const { x, y } = scaled(center)
  return (
    <polygon
      points="-3.5,-2.5 3.5,0 -3.5,2.5"
      transform={`translate(${x} ${y}) rotate(${rotation})`}
      className="fill-muted-foreground"
    />
  )
}

/** A small dot marking a turn corner of the circuit. */
function TurnMarker({ point }: Readonly<{ point: PatternPoint }>) {
  const { x, y } = scaled(point)
  return (
    <circle
      cx={x}
      cy={y}
      r={1.6}
      className="fill-background stroke-muted-foreground"
      strokeWidth={1}
    />
  )
}

const [crosswindTurn, downwindTurn, baseTurn, finalTurn] = RWY_2709_PATH_POINTS
const runwayWest = { x: RWY_2709_RUNWAY.xThreshold09, y: RWY_2709_RUNWAY.y }
const runwayEast = { x: RWY_2709_RUNWAY.xThreshold27, y: RWY_2709_RUNWAY.y }

const CIRCUIT_PATH = [runwayWest, crosswindTurn, downwindTurn, baseTurn, finalTurn, runwayEast]
  .map(scaled)
  .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
  .join(' ')

const LEG_ARROWS: DirectionArrowProps[] = [
  { center: { x: (runwayWest.x + crosswindTurn.x) / 2, y: RWY_2709_RUNWAY.y }, rotation: 180 }, // upwind: west
  { center: { x: crosswindTurn.x, y: (crosswindTurn.y + downwindTurn.y) / 2 }, rotation: 90 }, // crosswind: south
  { center: { x: (downwindTurn.x + baseTurn.x) / 2, y: downwindTurn.y }, rotation: 0 }, // downwind: east
  { center: { x: baseTurn.x, y: (baseTurn.y + finalTurn.y) / 2 }, rotation: 270 }, // base: north
  { center: { x: (finalTurn.x + runwayEast.x) / 2, y: RWY_2709_RUNWAY.y }, rotation: 180 }, // final: west
]

const runway = {
  x1: RWY_2709_RUNWAY.xThreshold09 * SCALE,
  x2: RWY_2709_RUNWAY.xThreshold27 * SCALE,
  yTop: (RWY_2709_RUNWAY.y - RWY_2709_RUNWAY.halfWidth) * SCALE,
  height: RWY_2709_RUNWAY.halfWidth * 2 * SCALE,
}

/** Inline SVG schematic of the RWY 27/09 left-hand traffic pattern. */
export function RwyPattern2709Lh() {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      role="img"
      aria-label="RWY 27/09 left-hand traffic pattern"
      className="text-foreground"
    >
      <path
        d={CIRCUIT_PATH}
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      {[crosswindTurn, downwindTurn, baseTurn, finalTurn].map((corner) => (
        <TurnMarker key={`${corner.x}-${corner.y}`} point={corner} />
      ))}
      {LEG_ARROWS.map((arrow) => (
        <DirectionArrow key={`${arrow.center.x}-${arrow.center.y}`} {...arrow} />
      ))}
      <rect
        x={runway.x1}
        y={runway.yTop}
        width={runway.x2 - runway.x1}
        height={runway.height}
        className="fill-foreground/80"
      />
      <text
        x={runway.x1 - 2}
        y={RWY_2709_RUNWAY.y * SCALE + 1}
        textAnchor="end"
        fontSize={4}
        className="fill-foreground"
      >
        09
      </text>
      <text
        x={runway.x2 + 2}
        y={RWY_2709_RUNWAY.y * SCALE + 1}
        textAnchor="start"
        fontSize={4}
        className="fill-foreground"
      >
        27
      </text>
    </svg>
  )
}
