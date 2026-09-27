// Unit test for the PreToolUse review-gate hook. Run:
//   node .claude/hooks/review-gate.test.mjs
// Spawns the real hook as a child process and feeds the Claude Code hook payload
// on STDIN — the channel the harness actually uses — so these tests pin the
// input contract and gate-file behaviour, not just the pattern matching.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOK = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-gate.js')

/** A minimal gate file with one ISSUE finding. */
const SAMPLE_GATE = JSON.stringify({
  findings: [
    {
      agent: 'semantic-reviewer',
      severity: 'ISSUE',
      summary: 'missing null check on line 42',
    },
  ],
})

/** Create a temp dir pre-populated with an empty .claude/ subdirectory. */
function makeDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-gate-test-'))
  mkdirSync(path.join(dir, '.claude'))
  return dir
}

/** Write a gate file inside dir/.claude/review-gate.json. */
function withGate(dir, content = SAMPLE_GATE) {
  writeFileSync(path.join(dir, '.claude', 'review-gate.json'), content, 'utf8')
}

/** Remove the temp dir. */
function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

const TIMEOUT_MS = 5_000

/**
 * Spawn the hook with the given stdin, running in cwd so the hook finds the gate file.
 *
 * runNode throws NO VERDICT on a signal, a timeout or a failed spawn — `status: null` otherwise
 * reaches `assert.equal(r.status, 2)` and reports a kill as a wrong exit code.
 */
function runHook(stdin, cwd) {
  return runNode('review-gate.js', [HOOK], { input: stdin, cwd, timeout: TIMEOUT_MS })
}

/** Hook stdin payload for an Edit/Write of filePath. */
function payload(filePath) {
  return JSON.stringify({ tool_input: { file_path: filePath } })
}

// --- No gate file ---

// CONTROL: green
// GROUP: review-gate-always-blocks
test('allows any edit when no gate file is present', () => {
  const dir = makeDir()
  try {
    const r = runHook('{"tool_input":{"file_path":"/src/app.ts"}}', dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Gate active — production files are blocked ---

// CONTROL: red
// GROUP: review-gate-always-passes
test('blocks a production file edit and surfaces findings when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook('{"tool_input":{"file_path":"/src/app.ts"}}', dir)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /BLOCKED/)
    assert.match(r.stderr, /ISSUE/)
    assert.match(r.stderr, /semantic-reviewer/)
    assert.match(r.stderr, /missing null check/)
  } finally {
    cleanup(dir)
  }
})

// --- Gate active — allowlisted paths pass through ---

test('allows a .test. file edit even when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook('{"tool_input":{"file_path":"/src/app.test.ts"}}', dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /.claude/ path edit even when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload(path.join(dir, '.claude', 'review-gate.json')), dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows a /docs/ path edit even when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload(path.join(dir, 'docs', 'diagram.svg')), dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-e2e-always-blocks
test('allows a spec.ts edit under apps/web/e2e/ even when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload(path.join(dir, 'apps', 'web', 'e2e', 'admin-students.spec.ts')), dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-no-path-normalization
test('blocks a production target reached through an exempt directory via ..', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload(`${dir}/apps/web/e2e/../app/app/quiz/actions/submit.ts`), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-exempt-dirs-unanchored
test('blocks a production file outside the repo root whose path contains apps/web/e2e/', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload('/vendor/apps/web/e2e/production.ts'), dir)
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-worktrees-exempt
test('blocks a production file inside a .claude/worktrees/ checkout when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(
      payload(path.join(dir, '.claude', 'worktrees', 'wt', 'apps', 'web', 'lib', 'foo.ts')),
      dir,
    )
    assert.equal(r.status, 2)
  } finally {
    cleanup(dir)
  }
})

// GROUP: review-gate-worktree-exempt-dirs-blocked
test('allows a docs edit inside a .claude/worktrees/ checkout when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook(payload(path.join(dir, '.claude', 'worktrees', 'wt', 'docs', 'x.ts')), dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

test('allows an .md file edit even when the gate is active', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook('{"tool_input":{"file_path":"/project/CONTRIBUTING.md"}}', dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Fail-open paths ---

test('fails open on unparseable stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook('not-json', dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

test('fails open on empty stdin (exit 0)', () => {
  const dir = makeDir()
  try {
    withGate(dir)
    const r = runHook('', dir)
    assert.equal(r.status, 0)
  } finally {
    cleanup(dir)
  }
})

// --- Corrupt gate file ---

test('still blocks on a corrupt gate file, substituting a parse-error message', () => {
  const dir = makeDir()
  try {
    withGate(dir, 'not valid json {')
    const r = runHook('{"tool_input":{"file_path":"/src/app.ts"}}', dir)
    assert.equal(r.status, 2)
    assert.match(r.stderr, /BLOCKED/)
    assert.match(r.stderr, /could not parse gate file/)
  } finally {
    cleanup(dir)
  }
})
