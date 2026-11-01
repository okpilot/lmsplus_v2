import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as builder from './build-tokens-css'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const req = createRequire(import.meta.url)
const THEME_CSS = readFileSync(req.resolve('tailwindcss/theme.css'), 'utf8')

const RED = [
  'font-bold',
  'font-light',
  'tracking-wide',
  'md:flex',
  'xl:flex',
  '2xl:flex',
  'max-md:flex',
  'shadow-lg',
  'inset-shadow-xs',
  'drop-shadow-md',
  'text-shadow-sm',
  'bg-red-500',
  'text-slate-700',
]
const GREEN = [
  'font-semibold',
  'tracking-code',
  'sm:flex',
  'lg:flex',
  'max-tiny:flex',
  'shadow-raised',
  'bg-primary',
  'bg-invalid-ring',
  'bg-white',
  'bg-transparent',
  'text-current',
  'p-nav-gap',
  'scroll-fade-y',
  'slide-in-from-top-2',
]

const escapeSel = (c: string) =>
  c.replace(/^(\d)/, (_, d: string) => `\\3${d} `).replace(/[:/.[\]()%]/g, '\\$&')
const hasRule = (css: string, cls: string) => css.includes(`.${escapeSel(cls)}`)

const compile = async (tokens: 'file' | string): Promise<string> => {
  const twPath = req.resolve('@tailwindcss/postcss')
  const r2 = createRequire(twPath)
  const postcss = r2('postcss')
  const tw = r2(twPath)
  const head = '@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";'
  const body = tokens === 'file' ? '@import "./tokens.css";' : tokens
  const out = await postcss([(tw.default ?? tw)()]).process(
    `${head} ${body} @source inline("${[...RED, ...GREEN].join(' ')}");`,
    { from: path.join(ROOT, 'app/probe.css') },
  )
  return out.css as string
}

const themeHues = (): string[] =>
  [
    ...new Set([...THEME_CSS.matchAll(/--color-([a-z]+)-50\s*:/g)].map((m) => m[1] as string)),
  ].sort()

describe('namespace resets', () => {
  let css = ''
  beforeAll(async () => {
    css = await compile('file')
  })

  it.each(RED)('stock %s generates no rule', (cls) => {
    expect(hasRule(css, cls), cls).toBe(false)
  })

  it.each(GREEN)('token-backed %s still compiles', (cls) => {
    expect(hasRule(css, cls), cls).toBe(true)
  })

  it('removing the colour reset line makes bg-red-500 compile again', async () => {
    const tokens = builder
      .buildTokensCss()
      .split('\n')
      .filter((l) => !/--color-red-\*\s*:\s*initial/.test(l))
      .join('\n')
    expect(tokens).not.toMatch(/--color-red-\*\s*:\s*initial/)
    const without = await compile(tokens)
    expect(hasRule(without, 'bg-red-500')).toBe(true)
    expect(builder.buildTokensCss()).toMatch(/--color-red-\*\s*:\s*initial/)
  })

  it('stockColourHues returns every --color-<hue>-50 hue of tailwindcss/theme.css', () => {
    const fn = (builder as Record<string, unknown>).stockColourHues
    expect(typeof fn).toBe('function')
    const hues = (fn as (s: string) => string[])(THEME_CSS)
    expect([...hues].sort()).toEqual(themeHues())
    expect(hues.length).toBeGreaterThanOrEqual(25)
  })

  it('tokens.css source resets exactly one --color-<hue>-* per stock hue', () => {
    const out = builder.buildTokensCss()
    const reset = [...out.matchAll(/--color-([a-z]+)-\*\s*:\s*initial/g)].map((m) => m[1]).sort()
    expect(reset).toEqual(themeHues())
  })

  it.each([
    'font-weight',
    'tracking',
    'breakpoint',
    'shadow',
    'inset-shadow',
    'drop-shadow',
    'text-shadow',
  ])('builder resets the --%s-* namespace', (ns) => {
    expect(builder.buildTokensCss()).toMatch(new RegExp(`--${ns}-\\*\\s*:\\s*initial`))
  })

  it('builder never resets --spacing or --animate-*', () => {
    const out = builder.buildTokensCss()
    expect(out).not.toMatch(/--spacing(-\*)?\s*:\s*initial/)
    expect(out).not.toMatch(/--animate-\*\s*:\s*initial/)
  })
})
