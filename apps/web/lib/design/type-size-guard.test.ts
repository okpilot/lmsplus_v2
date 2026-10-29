import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const ALLOW: string[] = []
const DEFAULT_SCALE = /(?<![\w-])(?:[a-z-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/
const ARBITRARY = /(?<![\w-])(?:[a-z-]+:)*text-\[\d/

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      walk(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe('type-size guard (AC 20)', () => {
  it('no source file uses a Tailwind default size or an arbitrary text size', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, f)
        if (ALLOW.includes(rel)) continue
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (DEFAULT_SCALE.test(line) || ARBITRARY.test(line)) hits.push(`${rel}:${i + 1}`)
          })
      }
    }
    expect(hits, 'map raw sizes to a role: caption / body / label / overline').toEqual([])
  })
})
