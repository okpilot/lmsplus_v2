// The runway surface for the RWY 27/09 traffic-pattern schematic: the paved
// rect plus a dashed centerline and threshold piano-key markings, so it reads
// as a runway rather than a plain bar. Split out of `rwy-2709-lh-pattern.tsx`
// to keep that component under the 150-line cap. No 'use client': pure artwork.
//
// Coordinate space matches the parent SVG: a landscape 16:9 viewBox (160 x 90),
// with the runway derived from the shared [0,1] fractions in `rwy-2709-layout.ts`.

import { RWY_2709_RUNWAY, RWY_2709_VBH as VBH, RWY_2709_VBW as VBW } from './rwy-2709-layout'

const runway = {
  x1: RWY_2709_RUNWAY.xThreshold09 * VBW,
  x2: RWY_2709_RUNWAY.xThreshold27 * VBW,
  yTop: (RWY_2709_RUNWAY.y - RWY_2709_RUNWAY.halfWidth) * VBH,
  height: RWY_2709_RUNWAY.halfWidth * 2 * VBH,
}

/** The runway surface with a dashed centerline and threshold piano-key
 *  markings at each end. */
export function RunwayBody() {
  const cy = runway.yTop + runway.height / 2
  const stripeCount = 4
  const stripeLen = 5
  const stripeH = 0.55
  const innerH = runway.height - 1.4
  const step = innerH / (stripeCount - 1)
  const stripeY = (i: number) => runway.yTop + 0.7 + i * step - stripeH / 2
  const thresholds = [runway.x1 + 1.5, runway.x2 - 1.5 - stripeLen]
  return (
    <g>
      <rect
        x={runway.x1}
        y={runway.yTop}
        width={runway.x2 - runway.x1}
        height={runway.height}
        rx={1}
        className="fill-foreground/85"
      />
      <line
        x1={runway.x1 + stripeLen + 3}
        y1={cy}
        x2={runway.x2 - stripeLen - 3}
        y2={cy}
        className="stroke-background"
        strokeWidth={0.8}
        strokeDasharray="3 2.2"
      />
      {thresholds.flatMap((tx) =>
        Array.from({ length: stripeCount }, (_, i) => (
          <rect
            key={`${tx}-${stripeY(i)}`}
            x={tx}
            y={stripeY(i)}
            width={stripeLen}
            height={stripeH}
            rx={0.15}
            className="fill-background"
          />
        )),
      )}
    </g>
  )
}
