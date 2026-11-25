// F3: run-security-auditor.sh fails closed when the diff cannot be computed.
// Run: node --test .claude/hooks/run-security-auditor.diff-fail.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

const capturingShim = (capture) =>
  `#!/usr/bin/env bash\n{ printf '%s\\n' "$@"; cat; } > "${capture}" 2>/dev/null\necho APPROVED\n`

// GROUP: run-security-auditor-always-passes
test('audits the working-tree diff, not "No changes", when a >3000-line fallback diff carries a secret', () => {
  const captureDir = mkdtempSync(join(tmpdir(), 'sec-aud-cap-'))
  const capture = join(captureDir, 'prompt.txt')
  try {
    const built = initShimScratch('sec-aud-big-', capturingShim(capture))
    writeFileSync(join(built.repoDir, 'leaked-credentials.ts'), 'export const a = 1\n')
    commitInit(gitFactory(built.repoDir))
    const lines = Array.from({ length: 3500 }, (_, i) => `export const v${i} = ${i}`)
    lines.push('const key = "AKIAIOSFODNN7EXAMPLE"')
    writeFileSync(join(built.repoDir, 'leaked-credentials.ts'), `${lines.join('\n')}\n`)
    runHookAndCleanup(built)
    const prompt = readFileSync(capture, 'utf8')
    assert.match(prompt, /leaked-credentials\.ts/)
    assert.doesNotMatch(prompt, /No changes/)
  } finally {
    rmSync(captureDir, { recursive: true, force: true })
  }
})

// GROUP: run-security-auditor-always-passes
test('exits 1 when the diff stat fails', () => {
  const built = initShimScratch('sec-aud-statfail-', APPROVE_SHIM)
  writeFileSync(join(built.repoDir, 'big.ts'), 'x\n')
  commitInit(gitFactory(built.repoDir))
  const lines = Array.from({ length: 3500 }, (_, i) => `export const v${i} = ${i}`)
  writeFileSync(join(built.repoDir, 'big.ts'), `${lines.join('\n')}\n`)
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(
    join(built.shimDir, 'git'),
    `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in *stat*) exit 1;; esac; done\nexec "${realGit}" "$@"\n`,
  )
  chmodSync(join(built.shimDir, 'git'), 0o755)
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 1)
})

const BIG_LINES = Array.from({ length: 3500 }, (_, i) => `export const v${i} = ${i}`)

function bigDiffRepo(prefix, gitShimBody) {
  const built = initShimScratch(prefix, APPROVE_SHIM)
  writeFileSync(join(built.repoDir, 'big.ts'), 'x\n')
  commitInit(gitFactory(built.repoDir))
  writeFileSync(join(built.repoDir, 'big.ts'), `${BIG_LINES.join('\n')}\n`)
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(built.shimDir, 'git'), gitShimBody(realGit))
  chmodSync(join(built.shimDir, 'git'), 0o755)
  return built
}

test('exits 1 and names the filter when filtering a large diff to security-sensitive files fails', () => {
  const built = bigDiffRepo(
    'sec-aud-filterfail-',
    (realGit) =>
      `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in *.env*) exit 1;; esac; done\nexec "${realGit}" "$@"\n`,
  )
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /filtering .* failed/)
})

test('exits 1 when a large diff has no security-sensitive file and its stat is empty', () => {
  const built = bigDiffRepo(
    'sec-aud-emptystat-',
    (realGit) =>
      `#!/usr/bin/env bash\nfor a in "$@"; do case "$a" in --stat) exit 0;; esac; done\nexec "${realGit}" "$@"\n`,
  )
  const r = runHookAndCleanup(built)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /nothing to audit/)
})
