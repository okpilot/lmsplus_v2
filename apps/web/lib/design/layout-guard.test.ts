import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// GROUP: allowlist — `file` -> owning PR; a stale entry fails the test below.
const ALLOW: Record<string, string> = {}

const RULES: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'named radius',
    /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|full)(?![\w-])/,
  ],
  ['bare rounded', /(?<![\w-])(?:[a-z-]+:)*rounded(?![\w-])/],
  ['arbitrary radius', /(?<![\w-])(?:[a-z-]+:)*rounded(?:-[trblse]{1,2})?-\[/],
  [
    'named max-w',
    /(?<![\w-])(?:[a-z-]+:)*max-w-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|prose)(?![\w-])/,
  ],
  ['arbitrary size', /(?<![\w-])(?:[a-z-]+:)*size-\[/],
  ['arbitrary value', /(?<![\w-])(?:[a-z0-9&_>*:()'-]+:)*[a-z][\w-]*-\[/],
  ['important', /(?<![\w:])(?:[a-z0-9&_>*()[\]'=:-]+:)*[a-z][\w-]*-[\w./()%-]+!(?=[\s"'`]|$)/],
]
const QUOTED = /(["'`])((?:(?!\1)[^\n])*)\1/g

function violations(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(QUOTED)) {
    for (const [name, re] of RULES) if (re.test(m[2] ?? '')) out.push(name)
  }
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next'].includes(e.name)) continue
      if (e.name === 'dev' && dir.endsWith(path.join('app'))) continue
      walk(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe('layout guard matcher (AC 2)', () => {
  const planted: ReadonlyArray<readonly [string, string]> = [
    ['rounded-lg', 'named radius'],
    ['md:rounded-t-xl', 'named radius'],
    ['rounded-full', 'named radius'],
    ['rounded-xs', 'named radius'],
    ['rounded', 'bare rounded'],
    ['rounded-[10px]', 'arbitrary radius'],
    ['max-w-2xl', 'named max-w'],
    ['sm:max-w-md', 'named max-w'],
    ['max-w-prose', 'named max-w'],
    ['max-w-[220px]', 'arbitrary value'],
    ['size-[18px]', 'arbitrary size'],
    ['[&_svg]:size-[14px]', 'arbitrary size'],
    ['mt-[3px]', 'arbitrary value'],
    ['size-3.5!', 'important'],
  ]
  for (const [cls, rule] of planted) {
    it(`flags ${cls} as ${rule}`, () => {
      expect(violations(`<div className="flex ${cls} p-2" />`)).toContain(rule)
    })
  }
  it('accepts tokenised classes', () => {
    const ok =
      'rounded-control rounded-card rounded-sheet rounded-inner rounded-pill rounded-none rounded-t-sheet max-w-content max-w-reading size-icon px-gutter lg:grid-cols-(--layout-setup)'
    expect(violations(`<div className="${ok}" />`)).toEqual([])
  })
})

describe('layout guard (AC 2)', () => {
  it('no source file uses a named radius, named max-width, arbitrary value or important', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components', 'lib']) {
      for (const f of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, f)
        if (rel in ALLOW) continue
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const v = violations(line)
            if (v.length) hits.push(`${rel}:${i + 1} ${[...new Set(v)].join(',')}`)
          })
      }
    }
    expect(
      hits,
      'use rounded-control|card|sheet|inner|pill, max-w-content|reading, size-icon*',
    ).toEqual([])
  })

  it('every allowlist entry still violates', () => {
    for (const rel of Object.keys(ALLOW)) {
      const text = readFileSync(path.join(ROOT, rel), 'utf8')
      expect(
        text.split('\n').some((l) => violations(l).length > 0),
        `stale: ${rel}`,
      ).toBe(true)
    }
  })
})
