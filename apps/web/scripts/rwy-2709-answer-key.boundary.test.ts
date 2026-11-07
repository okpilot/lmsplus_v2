import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as layout from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'

const REPO_ROOT = path.resolve(__dirname, '../../..')
const BIOME = path.join(REPO_ROOT, 'node_modules/.bin/biome')

const ALIAS = "import { RWY_2709_ZONES } from '@/scripts/rwy-2709-answer-key'"
const ALIAS_JS = "import { RWY_2709_ZONES } from '@/scripts/rwy-2709-answer-key.js'"
const RELATIVE = "import { RWY_2709_ZONES } from '../scripts/rwy-2709-answer-key'"
const USE = 'export const zones = RWY_2709_ZONES\n'

let scratch: string

// Lint runs in a scratch copy of the config: the repo tree is never written.
function lintProbe(relPath: string, importLine: string) {
  const abs = path.join(scratch, relPath)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, `${importLine}\n${USE}`)
  const r = spawnSync(BIOME, ['lint', '--colors=off', '--vcs-enabled=false', relPath], {
    cwd: scratch,
    encoding: 'utf8',
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), 'rwy-boundary-'))
  cpSync(path.join(REPO_ROOT, 'biome.json'), path.join(scratch, 'biome.json'))
  cpSync(path.join(REPO_ROOT, 'biome-plugins'), path.join(scratch, 'biome-plugins'), {
    recursive: true,
  })
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('RWY 27/09 answer-key boundary', () => {
  it('layout module exports neither RWY_2709_ZONES nor RWY_2709_LABELS (AC1)', () => {
    expect(Object.keys(layout)).not.toContain('RWY_2709_ZONES')
    expect(Object.keys(layout)).not.toContain('RWY_2709_LABELS')
  })

  const rejected: Array<[string, string]> = []
  for (const file of [
    'apps/web/app/x.ts',
    'apps/web/components/x.ts',
    'apps/web/lib/x.ts',
    'apps/web/proxy.ts',
    'packages/ui/src/x.ts',
  ]) {
    rejected.push([file, ALIAS], [file, ALIAS_JS])
  }
  rejected.push(['apps/web/app/x.ts', RELATIVE])

  it.each(rejected)('biome lint rejects the answer-key import in %s: %s (AC2)', (file, line) => {
    const { status, out } = lintProbe(file, line)
    expect(status).not.toBe(0)
    expect(out).toContain('#1218')
  })

  it.each(['apps/web/scripts/x.ts', 'apps/web/app/x.test.ts'])(
    'biome lint accepts the answer-key import in %s (AC2)',
    (file) => {
      const { status, out } = lintProbe(file, ALIAS)
      expect(out).toContain('Checked 1 file')
      expect(out).not.toContain('#1218')
      expect(status).toBe(0)
    },
  )
})
