import { describe, expect, it } from 'vitest'
import { buildTokensCss } from './build-tokens-css'
import * as scale from './scale'

const css = buildTokensCss()
const themeCss = css.slice(css.indexOf('@theme {'))
const desktop = css.match(/@media \(width >= 64rem\) \{[\s\S]*?\n\}/)?.[0] ?? ''
const decl = (name: string, value: string) => `  --${name}: ${value};`

const SPACING_ROLES = {
  'dialog-pad': '1rem',
  'card-sm': '0.75rem',
  'prose-indent': '1.25rem',
  'field-end': '2.5rem',
  'tap-x': '0.75rem',
  'tap-y': '0.5rem',
  'nav-gap': '1.75rem',
  'tab-clear': '6rem',
  'inset-lg': '4rem',
  'pad-control-sm': '0.5rem',
  'pad-control': '0.75rem',
  'pad-control-lg': '1rem',
  'stack-xs': '0.25rem',
  'stack-sm': '0.5rem',
  'stack-lg': '1rem',
}

const SIZES = {
  control: 'var(--control-h)',
  'control-sm': '28px',
  'control-lg': '48px',
  chip: '20px',
  avatar: '28px',
  'icon-box': '40px',
  'icon-box-lg': '48px',
  'skeleton-line': '1rem',
  'skeleton-title': '2rem',
  'skeleton-row': '3rem',
  'skeleton-row-lg': '4rem',
  'skeleton-card': '6rem',
  'skeleton-card-lg': '12rem',
  'skeleton-chart': '16rem',
  'skeleton-chart-lg': '24rem',
  'skeleton-w': '12rem',
  'skeleton-w-lg': '16rem',
  'scroll-xs': '8rem',
  'scroll-sm': '12rem',
  'scroll-md': '16rem',
  'field-min': '4rem',
  'slider-v': '10rem',
  'heatmap-cell': '1.875rem',
  'heatmap-cell-md': '2.375rem',
  'heatmap-row': '2.375rem',
  'heatmap-row-md': '2.875rem',
  'heatmap-label': '4.375rem',
  'heatmap-label-md': '7.5rem',
}

const CONTAINERS = {
  'col-xs': '80px',
  'col-code': '96px',
  popover: '15rem',
  'popover-sm': '12rem',
  'menu-min': '9rem',
  sidebar: '15rem',
  auth: '25rem',
}

const SIMPLE: ReadonlyArray<readonly [string, string, string]> = [
  ['ring-width-focus', '2px', 'AC1 ring focus'],
  ['ring-width-select', '2px', 'AC1 ring select'],
  ['ring-width-surface', '1px', 'AC1 ring surface'],
  ['ring-offset-width-focus', '2px', 'AC1 ring offset'],
  ['outline-width-focus', '2px', 'AC1 outline'],
  ['border-width-emphasis', '2px', 'AC1 border'],
  ['opacity-disabled', '50%', 'AC1 opacity'],
  ['stroke-width-icon', '2', 'AC1 stroke'],
  ['stroke-width-icon-bold', '2.5', 'AC1 stroke'],
  ['font-weight-normal', '400', 'AC1 weight'],
  ['font-weight-medium', '500', 'AC1 weight'],
  ['font-weight-semibold', '600', 'AC1 weight'],
  ['tracking-code', '0.1em', 'AC1 tracking'],
  ['tracking-normal', '0em', 'AC1 tracking'],
  ['tracking-logo', '-0.055em', 'AC1 tracking'],
  ['breakpoint-sm', '40rem', 'AC1 breakpoint'],
  ['breakpoint-lg', '64rem', 'AC1 breakpoint'],
  ['breakpoint-tiny', '23.4375rem', 'AC1 breakpoint'],
]

describe('AC1 scale records', () => {
  it.each([
    'SPACING_ROLES',
    'SIZES',
    'FONT_WEIGHTS',
    'TRACKING',
    'WIDTHS',
    'OPACITY',
    'STROKE',
    'BREAKPOINTS',
  ])('exports %s', (name) => {
    expect((scale as Record<string, unknown>)[name]).toBeDefined()
  })

  it('SPACING_ROLES has exactly the planned keys', () => {
    const s = (scale as unknown as Record<string, Record<string, unknown> | undefined>)
      .SPACING_ROLES
    expect(Object.keys(s ?? {}).sort()).toEqual(Object.keys(SPACING_ROLES).sort())
  })

  it('SIZES has exactly the planned keys', () => {
    const s = (scale as unknown as Record<string, Record<string, unknown> | undefined>).SIZES
    expect(Object.keys(s ?? {}).sort()).toEqual(Object.keys(SIZES).sort())
  })

  it('CONTAINERS gains the seven new keys', () => {
    for (const k of Object.keys(CONTAINERS)) expect(Object.keys(scale.CONTAINERS)).toContain(k)
  })

  it('BREAKPOINTS lg equals DESKTOP_FROM', () => {
    const b = (scale as unknown as Record<string, Record<string, unknown> | undefined>).BREAKPOINTS
    expect(b?.lg).toBe(scale.DESKTOP_FROM)
  })
})

describe('AC1 tokens.css theme declarations', () => {
  for (const [k, v] of Object.entries(SPACING_ROLES)) {
    it(`declares --spacing-${k}: ${v}`, () => {
      expect(themeCss).toContain(decl(`spacing-${k}`, v))
    })
  }
  for (const [k, v] of Object.entries(SIZES)) {
    it(`declares --spacing-${k}: ${v}`, () => {
      expect(themeCss).toContain(decl(`spacing-${k}`, v))
    })
  }
  for (const [k, v] of Object.entries(CONTAINERS)) {
    it(`declares --container-${k}: ${v}`, () => {
      expect(themeCss).toContain(decl(`container-${k}`, v))
    })
  }
  for (const [name, v, label] of SIMPLE) {
    it(`declares --${name}: ${v} (${label})`, () => {
      expect(themeCss).toContain(decl(name, v))
    })
  }
})

describe('AC1 type roles', () => {
  const val = (name: string) => new RegExp(`^  --${name}: (.+);$`, 'm').exec(themeCss)?.[1]
  const sameSize: ReadonlyArray<readonly [string, string, string, string, string]> = [
    ['label-strong', 'label', '1.3', '600', '0em'],
    ['caption-strong', 'caption', '1.4', '500', '0em'],
    ['chip', 'overline', '1.3', '500', '0em'],
    ['question', 'body', '1.625', '400', '0em'],
  ]
  for (const [role, base, lh, w, ls] of sameSize) {
    it(`text-${role} takes the ${base} size with lh ${lh}, weight ${w}, tracking ${ls}`, () => {
      expect(val(`text-${role}`)).toBeDefined()
      expect(val(`text-${role}`)).toBe(val(`text-${base}`))
      expect(themeCss).toContain(decl(`text-${role}--line-height`, lh))
      expect(themeCss).toContain(decl(`text-${role}--font-weight`, w))
      expect(themeCss).toContain(decl(`text-${role}--letter-spacing`, ls))
    })
  }

  it('TYPE_DESKTOP gains label-strong 14, caption-strong 13, chip 12', () => {
    expect(scale.TYPE_DESKTOP).toMatchObject({ 'label-strong': 14, 'caption-strong': 13, chip: 12 })
  })

  it('the 64rem step covers the strong roles and chip, not question', () => {
    expect(desktop).toContain('--text-label-strong: 0.875rem;')
    expect(desktop).toContain('--text-caption-strong: 0.8125rem;')
    expect(desktop).toContain('--text-chip: 0.75rem;')
    expect(desktop).not.toContain('--text-question')
  })
})
