// F2: the lefthook shims must fail closed and `prepare` must install them. Run:
//   node --test .claude/hooks/lefthook-install.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertUsable } from './spawn.testkit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PREPARE = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts?.prepare
const BARE_PATH = '/usr/bin:/bin'

const sh = (cmd, opts) => {
  const r = spawnSync('sh', ['-c', cmd], { encoding: 'utf8', timeout: 30_000, ...opts })
  assertUsable('sh', r, 30_000)
  return r
}

/**
 * The real lefthook binary this repo resolves, or null. Every candidate comes from lefthook's own
 * `optionalDependencies` — derived, never listed here: a bump adds members, and the names do NOT
 * follow `${process.platform}-${process.arch}` (lefthook spells Windows `windows`, node `win32`).
 */
function realLefthook() {
  const pkg = JSON.parse(
    readFileSync(path.join(ROOT, 'node_modules', 'lefthook', 'package.json'), 'utf8'),
  )
  for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
    const r = spawnSync(
      process.execPath,
      ['-e', `console.log(require.resolve(${JSON.stringify(`${name}/bin/lefthook`)}))`],
      { cwd: path.join(ROOT, 'node_modules', 'lefthook'), encoding: 'utf8' },
    )
    if (r.status === 0) return r.stdout.trim()
  }
  return null
}

/**
 * The binary, or a skip on a host that packages none. NEVER skips under CI: a bump that renames
 * the platform packages would otherwise leave both prepare tests skipped and the fail-closed shim
 * UNGRADED while CI stays green — the green-suite-that-checked-nothing this file exists to prevent.
 */
function lefthookOrSkip(t) {
  const real = realLefthook()
  if (real) return real
  if (process.env.CI)
    assert.fail('no lefthook platform package resolves — the shim guard is ungraded')
  t.skip('no lefthook platform binary packaged for this host')
  return null
}

test('package.json defines a prepare script that installs lefthook', () => {
  assert.equal(typeof PREPARE, 'string')
  assert.match(PREPARE, /lefthook install/)
})

test('prepare exits 0 outside a git repository', () => {
  assert.equal(typeof PREPARE, 'string')
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'prepare-nogit-')))
  try {
    const r = sh(PREPARE, {
      cwd: dir,
      env: { PATH: BARE_PATH, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
    })
    assert.equal(r.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a shim installed by prepare exits non-zero once lefthook is unresolvable', (t) => {
  assert.equal(typeof PREPARE, 'string')
  const real = lefthookOrSkip(t)
  if (!real) return
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'prepare-shim-')))
  const bin = path.join(dir, 'bin')
  const repo = path.join(dir, 'repo')
  try {
    mkdirSync(bin)
    mkdirSync(repo)
    copyFileSync(real, path.join(bin, 'lefthook'))
    chmodSync(path.join(bin, 'lefthook'), 0o755)
    sh('git init -q', { cwd: repo })
    writeFileSync(
      path.join(repo, 'lefthook.yml'),
      'pre-commit:\n  commands:\n    x:\n      run: "true"\n',
    )
    const inst = sh(PREPARE, { cwd: repo, env: { PATH: `${bin}:${BARE_PATH}` } })
    assert.equal(inst.status, 0)
    rmSync(bin, { recursive: true, force: true })
    const r = sh('.git/hooks/pre-commit', { cwd: repo, env: { PATH: BARE_PATH } })
    assert.notEqual(r.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('prepare run from a linked worktree patches the shim in the SHARED hooks dir', (t) => {
  assert.equal(typeof PREPARE, 'string')
  const real = lefthookOrSkip(t)
  if (!real) return
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'prepare-wt-')))
  const bin = path.join(dir, 'bin')
  const repo = path.join(dir, 'repo')
  const wt = path.join(dir, 'wt')
  try {
    mkdirSync(bin)
    mkdirSync(repo)
    copyFileSync(real, path.join(bin, 'lefthook'))
    chmodSync(path.join(bin, 'lefthook'), 0o755)
    sh('git init -q', { cwd: repo })
    writeFileSync(
      path.join(repo, 'lefthook.yml'),
      'pre-commit:\n  commands:\n    x:\n      run: "true"\n',
    )
    sh('git add lefthook.yml && git -c user.name=t -c user.email=t@t commit -q -m init', {
      cwd: repo,
    })
    sh(`git worktree add -q -b wt "${wt}"`, { cwd: repo })
    const inst = sh(PREPARE, { cwd: wt, env: { PATH: `${bin}:${BARE_PATH}` } })
    assert.equal(inst.status, 0, inst.stderr)
    rmSync(bin, { recursive: true, force: true })
    const shim = path.join(repo, '.git', 'hooks', 'pre-commit')
    assert.match(readFileSync(shim, 'utf8'), /lefthook not found - run: pnpm install/)
    const r = sh('.git/hooks/pre-commit', { cwd: repo, env: { PATH: BARE_PATH } })
    assert.notEqual(r.status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
