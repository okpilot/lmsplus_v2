import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')
const TEST_FILE = /\.test\.(ts|tsx|mjs)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !TEST_FILE.test(name)) out.push(full)
  }
  return out
}

describe('app code', () => {
  it('never calls window.confirm', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => /window\.confirm/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
