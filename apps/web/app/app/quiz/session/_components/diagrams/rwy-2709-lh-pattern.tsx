// Pure artwork for the RWY 27/09 left-hand traffic pattern `diagram_label`
// question. Renders ONLY the schematic (runway + circuit + direction arrows) —
// no drop-boxes and no labels-in-boxes, those overlay at runtime from the
// delivered `diagram_config.zones`. No 'use client' directive: this component
// has no interactivity and is safe to render on the server.
//
// Coordinate space: a LANDSCAPE 16:9 viewBox (160 x 90). The [0,1] fractions in
// `rwy-2709-layout.ts` map x -> *160 and y -> *90, so the circuit is drawn at
// its true landscape proportions under UNIFORM scaling (preserveAspectRatio
// default) — nothing is stretched. Because the drop-zone container has the same
// 16:9 aspect and positions each zone at (x*100%, y*100%), the artwork and the
// seeded `RWY_2709_ZONES` boxes line up by construction (fraction fx -> fx*160
// in a 160-wide viewBox scaled to the container = fx of the container width;
// likewise fy on height).

import { type PatternPoint, RWY_2709_PATH_POINTS, RWY_2709_RUNWAY } from './rwy-2709-layout'
import { RunwayBody } from './rwy-2709-runway-body'

const VBW = 160
const VBH = 90

function scaled(p: PatternPoint) {
  return { x: p.x * VBW, y: p.y * VBH }
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
      points="-5,-3.6 5,0 -5,3.6"
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
      r={2.4}
      className="fill-background stroke-muted-foreground"
      strokeWidth={1.4}
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

/** Inline SVG schematic of the RWY 27/09 left-hand traffic pattern. */
export function RwyPattern2709Lh() {
  return (
    <svg
      viewBox={`0 0 ${VBW} ${VBH}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="RWY 27/09 left-hand traffic pattern"
      className="text-foreground"
    >
      <path
        d={CIRCUIT_PATH}
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth={1.4}
        strokeDasharray="4.5 3"
      />
      {[crosswindTurn, downwindTurn, baseTurn, finalTurn].map((corner) => (
        <TurnMarker key={`${corner.x}-${corner.y}`} point={corner} />
      ))}
      {LEG_ARROWS.map((arrow) => (
        <DirectionArrow key={`${arrow.center.x}-${arrow.center.y}`} {...arrow} />
      ))}
      <RunwayBody />
    </svg>
  )
}
