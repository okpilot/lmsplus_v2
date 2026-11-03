type Oklch = readonly [l: number, c: number, h: number]

function parse(colour: string): Oklch {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(colour)
  if (!m) throw new Error(`mixOklch: not an oklch() colour: ${colour}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Linear mix of `b` into `a` by `pct` percent. No hue wrap; an achromatic side keeps the other's hue. */
export function mixOklch(a: string, b: string, pct: number): string {
  const [l1, c1, h1] = parse(a)
  const [l2, c2, h2] = parse(b)
  const t = pct / 100
  const hue = c2 === 0 ? h1 : c1 === 0 ? h2 : h1 + (h2 - h1) * t
  const l = l1 + (l2 - l1) * t
  const c = c1 + (c2 - c1) * t
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${hue.toFixed(2)})`
}
