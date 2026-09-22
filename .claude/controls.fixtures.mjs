// Fixture helpers for controls.repo.test.mjs. Builds a minimal synthetic root registering ONE
// guard, wired consistently across lefthook.yml / ci.yml / .claude/settings.json / pipeline.json
// `guards`, so controls.test.mjs's part (a) — the wired-set closure check — passes independently
// of the per-suite red/green coverage check under test.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNode } from './hooks/spawn.testkit.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'controls.test.mjs')

const GUARD_PATH = '.claude/hooks/fake-guard.mjs'
const SUITE_PATH = '.claude/hooks/fake-guard.test.mjs'
const MUTATIONS_PATH = '.claude/hooks/fake-guard.mutations.json'

/** Registers exactly the one guard the fixture wires — closes part (a) trivially. */
const PIPELINE_JSON = JSON.stringify({
  guards: { [GUARD_PATH]: { base: 'fake-guard', suites: [SUITE_PATH] } },
})

/** Wires `fake-guard.mjs` into a `run:` line so `fromLefthook` discovers it. */
const LEFTHOOK_YML = `pre-commit:\n  commands:\n    fake-guard:\n      run: node ${GUARD_PATH}\n`

/** No `node .claude/...` gate step — `fromCi` contributes nothing for this fixture. */
const CI_YML = 'jobs:\n  lint:\n    steps:\n      - run: echo noop\n'

/** No PreToolUse hooks — `fromSettings` contributes nothing for this fixture. */
const SETTINGS_JSON = JSON.stringify({ hooks: { PreToolUse: [], Stop: [] } })

const RED_ONLY_SUITE = [
  "import test from 'node:test'",
  '// CONTROL: red',
  '// GROUP: fake-guard-always-passes',
  "test('blocks a violation', () => {})",
  '',
].join('\n')

const RED_AND_GREEN_SUITE = [
  "import test from 'node:test'",
  '// CONTROL: red',
  '// GROUP: fake-guard-always-passes',
  "test('blocks a violation', () => {})",
  '// CONTROL: green',
  '// GROUP: fake-guard-always-blocks',
  "test('passes a clean input', () => {})",
  '',
].join('\n')

const MUTATIONS_JSON = JSON.stringify({
  target: GUARD_PATH,
  suites: [SUITE_PATH],
  mutations: [
    {
      id: 'fake-guard-always-passes',
      find: 'x',
      replace: 'y',
      expectRed: ['blocks a violation'],
    },
    {
      id: 'fake-guard-always-blocks',
      find: 'x',
      replace: 'y',
      expectRed: ['passes a clean input'],
    },
  ],
})

/** Create a throwaway dir, call fn, remove it however fn exits. */
export function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'controls-'))
  try {
    const write = (rel, body) => {
      mkdirSync(join(dir, dirname(rel)), { recursive: true })
      writeFileSync(join(dir, rel), body)
    }
    return fn({ dir, write })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeCommonFiles(write) {
  write('.claude/pipeline.json', PIPELINE_JSON)
  write('lefthook.yml', LEFTHOOK_YML)
  write('.github/workflows/ci.yml', CI_YML)
  write('.claude/settings.json', SETTINGS_JSON)
  write(GUARD_PATH, '// fake guard, never executed by controls.test.mjs\n')
}

/** A root registering `fake-guard` with a RED control only — controls.test.mjs must fail. */
export function withMissingGreenFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    write(SUITE_PATH, RED_ONLY_SUITE)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** A fully consistent root — controls.test.mjs must pass. */
export function withConsistentFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    write(SUITE_PATH, RED_AND_GREEN_SUITE)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** Run controls.test.mjs against a fixture root and return a gradable verdict. */
export function run({ dir }) {
  return runNode('controls', [SCRIPT, dir])
}

// ---------------------------------------------------------------------------------------------
// Discovery-form fixtures — `fake-guard` fully REGISTERED (pipeline.json + a consistent suite +
// matching mutations.json), wired through exactly ONE non-standard channel. Each asserts status
// 0: the guard must still be discovered as wired, or the wired-vs-registered closure check in
// part (a) fails it for a reason unrelated to the channel under test.

/** No `.claude/...` reference anywhere — every discovery channel contributes nothing. */
const NOOP_LEFTHOOK = 'pre-commit:\n  commands: {}\n'
const NOOP_CI = 'jobs:\n  lint:\n    steps:\n      - run: echo noop\n'
const NOOP_SETTINGS = JSON.stringify({ hooks: { PreToolUse: [], Stop: [] } })

/** Registers `fake-guard` with a fully consistent suite+mutations — closes parts (b)/(c). Leaves
 * lefthook.yml / ci.yml / settings.json to the caller, so each discovery fixture wires exactly
 * one channel and every OTHER channel stays a no-op. */
function writeRegisteredGuard(write) {
  write('.claude/pipeline.json', PIPELINE_JSON)
  write(GUARD_PATH, '// fake guard, never executed by controls.test.mjs\n')
  write(SUITE_PATH, RED_AND_GREEN_SUITE)
  write(MUTATIONS_PATH, MUTATIONS_JSON)
}

/** Wired ONLY via a compact `- run: ...` list-item CI step (no separate `- name:` line). */
export function withCiListItemFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write('lefthook.yml', NOOP_LEFTHOOK)
    write(
      '.github/workflows/ci.yml',
      `jobs:\n  lint:\n    steps:\n      - run: node ${GUARD_PATH}\n`,
    )
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

/** Wired ONLY via a `bash`-prefixed CI step (not `node`). */
export function withCiBashStepFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write('lefthook.yml', NOOP_LEFTHOOK)
    write(
      '.github/workflows/ci.yml',
      `jobs:\n  lint:\n    steps:\n      - name: run guard\n        run: bash ${GUARD_PATH}\n`,
    )
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

/** Wired ONLY via a lefthook.yml `run: |` block-scalar CONTINUATION line — the path is not on
 * the `run:` line itself. */
export function withLefthookContinuationFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write(
      'lefthook.yml',
      `pre-commit:\n  commands:\n    fake-guard:\n      run: |\n        echo pretend\n        node ${GUARD_PATH}\n`,
    )
    write('.github/workflows/ci.yml', NOOP_CI)
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

/** Wired ONLY via a SECOND, fixture-only workflow file, never `ci.yml`. */
export function withSecondWorkflowFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write('lefthook.yml', NOOP_LEFTHOOK)
    write('.github/workflows/ci.yml', NOOP_CI)
    write(
      '.github/workflows/other.yml',
      `jobs:\n  other:\n    steps:\n      - name: run guard\n        run: node ${GUARD_PATH}\n`,
    )
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

/** Wired ONLY via a `.claude/settings.json` `Stop` hook event, never `PreToolUse`. */
export function withStopHookFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write('lefthook.yml', NOOP_LEFTHOOK)
    write('.github/workflows/ci.yml', NOOP_CI)
    write(
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          PreToolUse: [],
          Stop: [{ hooks: [{ type: 'command', command: `node ${GUARD_PATH}` }] }],
        },
      }),
    )
    return fn({ dir })
  })
}

// ---------------------------------------------------------------------------------------------
// Grading-form fixtures — `fake-guard` fully WIRED (lefthook + ci + settings all standard, so
// part (a) closes cleanly), with exactly one part (b)/(c) grading defect. Each asserts status 1.

/** The CONTROL: red test's title does not appear in `fake-guard-always-passes`'s `expectRed`. */
export function withTitleMismatchFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    const suite = RED_AND_GREEN_SUITE.replace('blocks a violation', 'blocks a different violation')
    write(SUITE_PATH, suite)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** The data file's `suites` does not list the suite carrying the control. */
export function withSuiteNotListedFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    write(SUITE_PATH, RED_AND_GREEN_SUITE)
    const data = JSON.parse(MUTATIONS_JSON)
    data.suites = ['.claude/hooks/some-other-file.test.mjs']
    write(MUTATIONS_PATH, JSON.stringify(data))
    return fn({ dir })
  })
}

/** The data file's `target` does not equal the guard's own registry path. */
export function withTargetMismatchFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    write(SUITE_PATH, RED_AND_GREEN_SUITE)
    const data = JSON.parse(MUTATIONS_JSON)
    data.target = '.claude/hooks/some-other-guard.mjs'
    write(MUTATIONS_PATH, JSON.stringify(data))
    return fn({ dir })
  })
}

/** The CONTROL: red test is written `test.skip(...)` — never runs. */
export function withSkippedControlFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    const suite = RED_AND_GREEN_SUITE.replace(
      "test('blocks a violation'",
      "test.skip('blocks a violation'",
    )
    write(SUITE_PATH, suite)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** Wired ONLY via a `node --test <path>` CI step — the path should NOT be discovered as a guard
 * wiring because `node --test` launches a test runner, not a guard directly. */
export function withNodeTestStepFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeRegisteredGuard(write)
    write('lefthook.yml', NOOP_LEFTHOOK)
    write(
      '.github/workflows/ci.yml',
      `jobs:\n  test:\n    steps:\n      - run: node --test ${GUARD_PATH}\n`,
    )
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

const BACKTICK_RED_AND_GREEN_SUITE = [
  "import test from 'node:test'",
  '// CONTROL: red',
  '// GROUP: fake-guard-always-passes',
  'test(`blocks a violation`, () => {})',
  '// CONTROL: green',
  '// GROUP: fake-guard-always-blocks',
  "test('passes a clean input', () => {})",
  '',
].join('\n')

/** The CONTROL: red test's title is a backtick (template-literal) string — `extractTitle` returns
 * null, which controls.test.mjs must treat as a grading failure (fail closed). */
export function withUnextractableTitleFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    write(SUITE_PATH, BACKTICK_RED_AND_GREEN_SUITE)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** The CONTROL: red test uses `test.todo(...)` — the second `skip|todo` form, never runs. */
export function withTodoControlFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    const suite = RED_AND_GREEN_SUITE.replace(
      "test('blocks a violation'",
      "test.todo('blocks a violation'",
    )
    write(SUITE_PATH, suite)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}

/** A root wiring a `.cjs`-extension guard via lefthook.yml but never registering it in
 * pipeline.json — the unregistered-but-wired half of part (a)'s closure check. Proves
 * `CLAUDE_PATH_RE` actually discovers a `.cjs` path: under the pre-widening `.mjs|.js|.sh`-only
 * regex this path was invisible to `fromLefthook`, so `unregistered` stayed empty and the check
 * passed despite an unregistered guard sitting in the wiring. */
export function withUnregisteredCjsGuardFixture(fn) {
  return withFixture(({ dir, write }) => {
    write('.claude/pipeline.json', JSON.stringify({ guards: {} }))
    write(
      'lefthook.yml',
      'pre-commit:\n  commands:\n    fake-guard-cjs:\n      run: node .claude/hooks/fake-guard.cjs\n',
    )
    write('.github/workflows/ci.yml', NOOP_CI)
    write('.claude/settings.json', NOOP_SETTINGS)
    return fn({ dir })
  })
}

/** The CONTROL: red test uses a `{ skip: true }` options object — the options-form skip, never runs. */
export function withSkipOptionsFixture(fn) {
  return withFixture(({ dir, write }) => {
    writeCommonFiles(write)
    const suite = RED_AND_GREEN_SUITE.replace(
      "test('blocks a violation', () => {})",
      "test('blocks a violation', { skip: true }, () => {})",
    )
    write(SUITE_PATH, suite)
    write(MUTATIONS_PATH, MUTATIONS_JSON)
    return fn({ dir })
  })
}
