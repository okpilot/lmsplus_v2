// #1202: run-security-auditor.sh fails closed when no `timeout` binary exists.
// Run: node --test .claude/hooks/run-security-auditor.notimeout.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  commitInit,
  gitFactory,
  HOOK,
  initShimScratch,
  TIMEOUT_MS,
} from './run-security-auditor.testkit.mjs'
import { assertUsable } from './spawn.testkit.mjs'

const APPROVE_SHIM = '#!/usr/bin/env bash\necho APPROVED\n'

/** A bin dir linking every executable on the host PATH except `timeout`. */
function binWithoutTimeout(dir) {
  mkdirSync(dir, { recursive: true })
  for (const p of (process.env.PATH ?? '').split(':')) {
    if (!p || !existsSync(p)) continue
    for (const name of readdirSync(p)) {
      if (name === 'timeout' || name === 'claude') continue
      try {
        accessSync(join(p, name), constants.X_OK)
        symlinkSync(join(p, name), join(dir, name))
      } catch {
        // first PATH entry wins
      }
    }
  }
}

test('exits 1 naming `timeout` when no timeout binary is on PATH', () => {
  const { scratch, shimDir, repoDir } = initShimScratch('sec-aud-notimeout-', APPROVE_SHIM)
  try {
    commitInit(gitFactory(repoDir))
    writeFileSync(join(repoDir, 'file.txt'), 'base\nchanged\n')
    const bin = join(scratch, 'bin')
    binWithoutTimeout(bin)
    const r = spawnSync('bash', [HOOK], {
      cwd: repoDir,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: { ...process.env, PATH: `${shimDir}:${bin}` },
    })
    assertUsable('run-security-auditor.sh', r, TIMEOUT_MS)
    assert.equal(r.status, 1)
    assert.match(
      `${r.stdout}${r.stderr}`,
      /(no|missing|not (found|installed|available)).{0,40}`?timeout`?|`?timeout`?.{0,40}(not found|missing|not installed|unavailable)/i,
    )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
