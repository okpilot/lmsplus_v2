// Run: node --test .claude/controls.repo.test.mjs
//
// Spawns controls.test.mjs against synthetic fixture roots — controls.test.mjs is itself a
// guard (it is registered in pipeline.json `guards`, base `controls`), so its own wiring/exit-
// code contract needs a spawned, graded red and green control same as every other guard's.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  run,
  withCiBashStepFixture,
  withCiListItemFixture,
  withConsistentFixture,
  withFixture,
  withLefthookContinuationFixture,
  withMissingGreenFixture,
  withSecondWorkflowFixture,
  withSkippedControlFixture,
  withStopHookFixture,
  withSuiteNotListedFixture,
  withTargetMismatchFixture,
  withTitleMismatchFixture,
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

// MUTATION: revert the run-line regex to require the line start with `run:` (no leading `- `)
// GROUP: controls-always-blocks, controls-ci-list-item
test('a guard wired only via a compact `- run:` list-item CI step is still discovered', () =>
  withCiListItemFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

// MUTATION: drop any run step whose first line does not literally start with `node`
// GROUP: controls-always-blocks, controls-ci-bash-wrapper
test('a guard wired only via a `bash`-prefixed CI step is still discovered', () =>
  withCiBashStepFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

// MUTATION: revert lefthook scanning to only lines starting with `run:`
// GROUP: controls-always-blocks, controls-lefthook-continuation
test('a guard wired only via a lefthook.yml block-continuation line is still discovered', () =>
  withLefthookContinuationFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

// MUTATION: scan only .github/workflows/ci.yml instead of every workflow file
// GROUP: controls-always-blocks, controls-scan-all-workflows
test('a guard wired only via a second, non-ci.yml workflow file is still discovered', () =>
  withSecondWorkflowFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

// MUTATION: scan only the PreToolUse hook event in .claude/settings.json
// GROUP: controls-always-blocks, controls-settings-stop-event
test('a guard wired only via a Stop hook event is still discovered', () =>
  withStopHookFixture(({ dir }) => {
    const { status } = run({ dir })
    assert.equal(status, 0)
  }))

// MUTATION: drop the check that a control's title is in its mutation's expectRed
// GROUP: controls-always-passes, controls-title-check
test('a CONTROL test whose title is missing from expectRed blocks', () =>
  withTitleMismatchFixture(({ dir }) => {
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /is not in fake-guard-always-passes's expectRed/)
  }))

// MUTATION: drop the check that the data file's suites includes the suite under test
// GROUP: controls-always-passes, controls-suites-check
test('a mutations.json whose suites omits the suite under test blocks', () =>
  withSuiteNotListedFixture(({ dir }) => {
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /`suites` does not include this suite/)
  }))

// MUTATION: drop the check that the data file's target equals the guard path
// GROUP: controls-always-passes, controls-target-check
test('a mutations.json whose target does not equal the guard path blocks', () =>
  withTargetMismatchFixture(({ dir }) => {
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /does not equal guard path/)
  }))

// MUTATION: drop the .skip/.todo check on a CONTROL test
// GROUP: controls-always-passes, controls-skip-check
test('a `.skip`-ed CONTROL test blocks — a control must run to be graded', () =>
  withSkippedControlFixture(({ dir }) => {
    const { status, stderr } = run({ dir })
    assert.equal(status, 1)
    assert.match(stderr, /is \.skip\/\.todo — never runs, not a graded control/)
  }))
