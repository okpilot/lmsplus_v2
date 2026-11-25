// F3: run-security-auditor.sh fails closed when the diff cannot be computed.
// Run: node --test .claude/hooks/run-security-auditor.diff-fail.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  commitInit,
  gitFactory,
  initShimScratch,
  runHookAndCleanup,
  TIMEOUT_MS,
} from './run-security-auditor.testkit.mjs'

const APPROVE_SHIM = '#!/usr/bin/env bash\necho APPROVED\n'

// GROUP: run-security-auditor-always-passes
test('exits 1 when the upstream ref and origin/master are both unresolvable', () => {
  const built = initShimScratch('sec-aud-noref-', APPROVE_SHIM)
  commitInit(gitFactory(built.repoDir))
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 1)
  assert.doesNotMatch(r.stdout, /No diff to audit/)
})

// GROUP: run-security-auditor-always-passes
test('exits 1 when git diff against the remote ref fails (no merge base)', () => {
  const built = initShimScratch('sec-aud-nobase-', APPROVE_SHIM)
  const git = gitFactory(built.repoDir)
  commitInit(git)
  git(['checkout', '-q', '--orphan', 'unrelated'])
  git(['rm', '-rfq', '.'])
  writeFileSync(join(built.repoDir, 'other.txt'), 'x\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'unrelated'])
  git(['update-ref', 'refs/remotes/origin/master', 'HEAD'])
  git(['checkout', '-q', '-f', '-b', 'work', 'HEAD~0'])
  git(['checkout', '-q', '--orphan', 'work2'])
  git(['rm', '-rfq', '.'])
  writeFileSync(join(built.repoDir, 'work.txt'), 'y\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'work'])
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 1)
  assert.doesNotMatch(r.stdout, /No diff to audit/)
})

// GROUP: run-security-auditor-always-blocks
test('exits 0 when the diff succeeds and is empty', () => {
  const built = initShimScratch('sec-aud-empty-', APPROVE_SHIM)
  const { scratch, repoDir } = built
  const remoteDir = join(scratch, 'remote.git')
  mkdirSync(remoteDir, { recursive: true })
  spawnSync('git', ['init', '-q', '--bare'], { cwd: remoteDir, timeout: TIMEOUT_MS })
  const git = gitFactory(repoDir)
  commitInit(git)
  git(['remote', 'add', 'origin', remoteDir])
  const branch = git(['branch', '--show-current']).stdout.trim()
  git(['push', '-q', '-u', 'origin', branch])
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /No diff to audit/)
})
