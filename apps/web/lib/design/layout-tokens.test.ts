import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildTokensCss } from './build-tokens-css'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app')
const css = buildTokensCss()
const decl = (name: string) => new RegExp(`^\\s*--${name}:\\s*([^;]+);`, 'm').exec(css)?.[1]?.trim()

describe('layout tokens (AC 1)', () => {
  it('clears the default radius namespace before declaring radii', () => {
    expect(css).toMatch(/--radius-\*:\s*initial;/)
    expect(css.indexOf('--radius-*: initial')).toBeLessThan(css.indexOf('--radius-control'))
  })

  const exact: ReadonlyArray<readonly [string, string]> = [
    ['radius-inner', '0.25rem'],
    ['radius-pill', 'calc(infinity * 1px)'],
    ['spacing-row', '0.75rem'],
    ['spacing-cell-y', '0.625rem'],
    ['spacing-cell-x', '0.75rem'],
    ['spacing-icon-sm', '0.875rem'],
    ['spacing-icon', '1rem'],
    ['spacing-icon-nav', '1.125rem'],
    ['spacing-icon-lg', '1.25rem'],
    ['spacing-icon-xl', '1.5rem'],
    ['container-field', '28ch'],
  ]
  for (const [name, value] of exact) {
    it(`--${name} is ${value}`, () => {
      expect(decl(name)).toBe(value)
    })
  }

  it('rail widths are 340px and 360px (or the rem equivalent)', () => {
    expect(decl('spacing-rail')).toMatch(/^(340px|21\.25rem)$/)
    expect(decl('spacing-setup-rail')).toMatch(/^(360px|22\.5rem)$/)
  })

  it('declares the layout, session and dialog variables', () => {
    for (const n of [
      'layout-setup',
      'layout-session',
      'layout-saved-row',
      'spacing-progress',
      'session-header-h',
      'panel-max',
      'container-dialog',
      'container-dialog-wide',
      'container-dialog-md',
      'dialog-max',
    ]) {
      expect(decl(n), `--${n}`).toBeDefined()
    }
    expect(decl('container-dialog')).toBe('24rem')
    expect(decl('container-dialog-wide')).toBe('42rem')
    expect(decl('container-dialog-md')).toBe('28rem')
    expect(decl('panel-max')).toContain('--session-header-h')
    expect(decl('layout-setup')).toContain('--spacing-setup-rail')
  })

  it('globals.css keeps no legacy radius scale and no typography plugin', () => {
    const g = readFileSync(path.join(APP, 'globals.css'), 'utf8')
    expect(g).not.toMatch(/--radius-(xs|sm|md|lg|xl|2xl|3xl|4xl)\b/)
    expect(g).not.toContain('@tailwindcss/typography')
  })

  it('@tailwindcss/typography is not a dependency', () => {
    const pkg = readFileSync(path.join(APP, '../package.json'), 'utf8')
    expect(pkg).not.toContain('@tailwindcss/typography')
  })
})

describe('layout tokens (B2b-12 AC 7)', () => {
  it('--layout-setup-rows is auto 1fr', () => {
    expect(decl('layout-setup-rows')).toBe('auto 1fr')
  })
})
