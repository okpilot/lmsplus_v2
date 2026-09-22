// Run: node --test .claude/controls.repo.test.mjs
//
// Spawns controls.test.mjs against synthetic fixture roots — controls.test.mjs is itself a
// guard (it is registered in pipeline.json `guards`, base `controls`), so its own wiring/exit-
// code contract needs a spawned, graded red and green control same as every other guard's.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  run,
  withConsistentFixture,
  withFixture,
  withMissingGreenFixture,
} from './controls.fixtures.mjs'

// CONTROL: red
// GROUP: controls-always-passes
test('a guard registered with a red control but no green control blocks', () =>
  withMissingGreenFixture(({ dir }) => {
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /no CONTROL: green test/)
  }))

// CONTROL: green
// GROUP: controls-always-blocks
test('a guard registered with linked red and green controls passes', () =>
  withConsistentFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

test('a guard wired in lefthook.yml but absent from the registry blocks', () =>
  withFixture(({ dir, write }) => {
    // The fixture's pipeline.json registers no guard while its lefthook.yml wires one.
    // claim-ok: describes the temp-root fixture written below, not this repository
    write('.claude/pipeline.json', JSON.stringify({ guards: {} }))
    write(
      'lefthook.yml',
      'pre-commit:\n  commands:\n    fake-guard:\n      run: node .claude/hooks/fake-guard.mjs\n',
    )
    write('.github/workflows/ci.yml', 'jobs:\n  lint:\n    steps:\n      - run: echo noop\n')
    write('.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [], Stop: [] } }))
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /wired but not registered/)
  }))

test('a suite path the registry names but that does not exist on disk blocks', () =>
  withFixture(({ dir, write }) => {
    write(
      '.claude/pipeline.json',
      JSON.stringify({
        guards: {
          '.claude/hooks/fake-guard.mjs': {
            base: 'fake-guard',
            suites: ['.claude/hooks/fake-guard.test.mjs'],
          },
        },
      }),
    )
    write(
      'lefthook.yml',
      'pre-commit:\n  commands:\n    fake-guard:\n      run: node .claude/hooks/fake-guard.mjs\n',
    )
    write('.github/workflows/ci.yml', 'jobs:\n  lint:\n    steps:\n      - run: echo noop\n')
    write('.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [], Stop: [] } }))
    write('.claude/hooks/fake-guard.mjs', '// fake guard\n')
    // Deliberately no fake-guard.test.mjs written, and no fake-guard.mutations.json either.
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /suite \.claude\/hooks\/fake-guard\.test\.mjs does not exist/)
  }))
