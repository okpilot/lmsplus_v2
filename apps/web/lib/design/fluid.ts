const MIN_VW = 360
const MAX_VW = 1240

const round = (n: number) => +n.toFixed(4)
export const rem = (px: number) => `${round(px / 16)}rem`

/** Linear clamp() between MIN_VW and MAX_VW; preferred value = intercept rem + slope vw. */
export function fluid(minPx: number, maxPx: number): string {
  if (minPx > maxPx)
    throw new RangeError(`fluid: minPx (${minPx}) must not exceed maxPx (${maxPx})`)
  if (minPx === maxPx) return rem(minPx)
  const slope = (maxPx - minPx) / (MAX_VW - MIN_VW)
  const intercept = minPx - slope * MIN_VW
  return `clamp(${rem(minPx)}, ${rem(intercept)} + ${round(slope * 100)}vw, ${rem(maxPx)})`
}
