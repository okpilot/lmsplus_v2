import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as layout from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'

const REPO_ROOT = path.resolve(__dirname, '../../..')
const BIOME = path.join(REPO_ROOT, 'node_modules/.bin/biome')
const IMPORT_LINE =
  "import { RWY_2709_ZONES } from '@/scripts/rwy-2709-answer-key'\nexport const zones = RWY_2709_ZONES\n"

// biome stdin mode reports no rule diagnostics, so lint a short-lived probe file at the target path.
function lintProbe(relPath: string, source: string) {
  const abs = path.join(REPO_ROOT, relPath)
  writeFileSync(abs, source)
  try {
    const r = spawnSync(BIOME, ['lint', '--colors=off', relPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    return { status: r.status, out: `${r.stdout}${r.stderr}` }
  } finally {
    rmSync(abs, { force: true })
  }
}

describe('RWY 27/09 answer-key boundary', () => {
  it('layout module exports neither RWY_2709_ZONES nor RWY_2709_LABELS (AC1)', () => {
    expect(Object.keys(layout)).not.toContain('RWY_2709_ZONES')
    expect(Object.keys(layout)).not.toContain('RWY_2709_LABELS')
  })

  it.each([
    'apps/web/app/zz-boundary-probe.ts',
    'apps/web/components/zz-boundary-probe.ts',
    'apps/web/lib/zz-boundary-probe.ts',
  ])('biome lint rejects the answer-key import in %s (AC2)', (file) => {
    const { status, out } = lintProbe(file, IMPORT_LINE)
    expect(status).not.toBe(0)
    expect(out).toContain('noRestrictedImports')
  })

  it('biome lint rejects a relative answer-key import under apps/web/app (AC2)', () => {
    const src =
      "import { RWY_2709_LABELS } from '../../../scripts/rwy-2709-answer-key'\nexport const labels = RWY_2709_LABELS\n"
    const { status, out } = lintProbe('apps/web/app/zz-boundary-probe-rel.ts', src)
    expect(status).not.toBe(0)
    expect(out).toContain('noRestrictedImports')
  })

  it('biome lint accepts the answer-key import under apps/web/scripts (AC2)', () => {
    const { status, out } = lintProbe('apps/web/scripts/zz-boundary-probe.ts', IMPORT_LINE)
    expect(out).not.toContain('noRestrictedImports')
    expect(status).toBe(0)
  })
})
