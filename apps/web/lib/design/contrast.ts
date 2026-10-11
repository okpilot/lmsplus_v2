/** WCAG contrast from OKLCH strings. A translucent colour is composited over the background. */
type Rgb = [number, number, number]
type Oklch = { l: number; c: number; h: number; a: number }

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/

function parseOklch(value: string): Oklch {
  const m = OKLCH.exec(value.trim())
  if (!m) throw new Error(`Not an oklch() colour: ${value}`)
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] === '%' ? 100 : 1)
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]), a: alpha }
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toSrgb = (x: number) => {
  const v = Math.min(1, Math.max(0, x))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

function toRgb({ l, c, h, a }: Oklch, bg: Rgb): Rgb {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const L = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const M = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const S = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
  return lin.map((x, i) => toSrgb(x) * a + (bg[i] as number) * (1 - a)) as Rgb
}

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

/** WCAG ratio of `fg` on `bg`; a translucent `bg` is composited over `under` (default white). */
export function contrastRatio(fg: string, bg: string, under = 'oklch(1 0 0)'): number {
  const back = toRgb(parseOklch(bg), toRgb(parseOklch(under), [1, 1, 1]))
  const x = luminance(toRgb(parseOklch(fg), back))
  const y = luminance(back)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
