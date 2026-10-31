import { describe, expect, it } from 'vitest'
import { COLOURS } from './colour'
import { EMAIL_COLOURS } from './email-colours'

const toLinear = (v: number) => v
const toSrgb = (x: number) => {
  const v = Math.min(1, Math.max(0, x))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}
function oklchToRgb255(value: string): number[] {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value)
  if (!m) throw new Error(value)
  const [l, c, h] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180]
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ].map((x) => toSrgb(toLinear(x)) * 255)
}

const MAP = {
  text: 'foreground',
  muted: 'muted-foreground',
  accent: 'primary',
  'on-accent': 'primary-foreground',
  surface: 'muted',
} as const

describe('AC3 EMAIL_COLOURS', () => {
  it('has exactly text, muted, accent, on-accent, surface', () => {
    expect(Object.keys(EMAIL_COLOURS).sort()).toEqual(Object.keys(MAP).sort())
  })
  for (const [key, token] of Object.entries(MAP)) {
    it(`${key} is a #rrggbb within 1/255 of light ${token}`, () => {
      const hex = (EMAIL_COLOURS as Record<string, string>)[key] ?? ''
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      const got = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
      const want = oklchToRgb255(COLOURS.light[token])
      for (const [i, g] of got.entries())
        expect(Math.abs(g - (want[i] as number))).toBeLessThanOrEqual(1)
    })
  }
})
