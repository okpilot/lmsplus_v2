import { describe, expect, it } from 'vitest'
import { buildTokensCss } from './build-tokens-css'
import * as colour from './colour'

const KEYS = [
  'invalid-ring',
  'invalid-border',
  'field-fill',
  'data-future',
  'field-disabled',
  'switch-off',
  'selected-ring',
  'primary-border-hover',
  'primary-border-soft',
  'danger-soft-hover',
  'glass',
  'data-empty',
  'diagram-line',
  'diagram-fill',
]
const css = buildTokensCss()
const [rootPart = '', darkPart = ''] = css.split('.dark {')
const darkBlock = darkPart.split('\n}')[0] ?? ''
const VALUE =
  '(color-mix\\(in oklab, var\\(--[a-z-]+\\) \\d+(?:\\.\\d+)?%, transparent\\)|transparent)'

describe('AC2 alpha colour tokens', () => {
  it('exports ALPHA_COLOURS separate from COLOURS', () => {
    expect((colour as Record<string, unknown>).ALPHA_COLOURS).toBeDefined()
    for (const k of KEYS) {
      expect(Object.keys(colour.COLOURS.light)).not.toContain(k)
      expect(Object.keys(colour.COLOURS.dark)).not.toContain(k)
    }
  })

  it('keeps alpha keys out of CONTRAST_PAIRS', () => {
    const used = colour.CONTRAST_PAIRS.flatMap(([a, b]) => [a, b] as string[])
    for (const k of KEYS) expect(used).not.toContain(k)
  })

  for (const k of KEYS) {
    it(`${k} is a color-mix of an opaque token in :root and .dark and maps to --color-${k}`, () => {
      const re = new RegExp(`^  --${k}: ${VALUE};$`, 'm')
      expect(rootPart).toMatch(re)
      expect(darkBlock).toMatch(new RegExp(`^  --${k}: ${VALUE};$`, 'm'))
      expect(css).toContain(`  --color-${k}: var(--${k});`)
    })
  }
})
