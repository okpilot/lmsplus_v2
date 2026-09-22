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
