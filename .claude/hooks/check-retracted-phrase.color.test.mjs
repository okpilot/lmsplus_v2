// Run: node --test .claude/hooks/check-retracted-phrase.color.test.mjs
//
// `hunksFor` diffs blob-to-blob with `--no-ext-diff --no-textconv` but, before this suite's
// fix, no `--no-color`. Under a repo-local `color.ui always` (never committed — the same
// attacker's-own-machine config `check-retracted-phrase.paths.test.mjs` already exercises for
// `diff.relative`), git wraps every `@@`/`-`/`+` line in ANSI escapes; `parseHunks` requires
// those markers unprefixed, finds none, and throws — so the guard exits 2 (could-not-run) on
// EVERY commit touching a corpus file, not just a retraction. Split out of
// check-retracted-phrase.repo.test.mjs to stay under its own file-size cap.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { run, seedFlagship, withRepo } from './check-retracted-phrase.testkit.mjs'

/**
 * Prove `color.ui always` is ACTIVE on the exact blob-to-blob diff `hunksFor` runs, before
 * trusting a test built on it: without `--no-color`, the hunk must carry an ANSI escape; with
 * it, none.
 */
function assertColorBlobDiffActive(dir, path) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  const src = git('rev-parse', `HEAD:${path}`).trim()
  const dst = git('rev-parse', `:${path}`).trim()
  const diffArgs = [
    '--no-pager',
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--text',
    '-U0',
    '--no-relative',
  ]
  const hidden = git(...diffArgs, src, dst)
  const shown = git(...diffArgs, '--no-color', src, dst)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ANSI escape is present
  assert.match(hidden, /\x1b\[/)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ANSI escape is absent
  assert.doesNotMatch(shown, /\x1b\[/)
}

// CONTROL: red
// GROUP: check-retracted-phrase-always-passes, check-retracted-phrase-color-blobdiff, check-retracted-phrase-color-grep
test('blocks a corrected value under color.ui=always, exactly as without it', () => {
  // MUTATION: dropping --no-color from hunksFor's blob-to-blob diff lets a local
  // `color.ui always` wrap every line in ANSI escapes; parseHunks then finds no `@@`/`-`/`+`
  // markers and throws, so the guard exits 2 instead of correctly blocking at exit 1. Dropping
  // --no-color from survivors()'s `git grep -l` instead wraps the matched filename in ANSI
  // escapes, so `inCorpus` rejects it and the retraction reads as complete — a silent pass.
  withRepo((r) => {
    seedFlagship(r)
    r.git('config', 'color.ui', 'always')
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.git('add', '-A')
    assertColorBlobDiffActive(r.dir, '.claude/limits.json')
    const { status, stderr } = run(r, 'fix: correct the generated line count\n')
    assert.equal(status, 1)
    assert.match(stderr, /retracted the value `1807`/)
    assert.match(stderr, /check-file-size-guard\.test\.mjs/)
  })
})

// CONTROL: green
// GROUP: check-retracted-phrase-always-blocks
test('passes a clean correction under color.ui=always, exactly as without it', () => {
  // MUTATION: make the rarity floor 0 instead of 1 (check-retracted-phrase-always-blocks) →
  // a fully completed correction blocks its own commit even with the fix applied.
  withRepo((r) => {
    seedFlagship(r)
    r.git('config', 'color.ui', 'always')
    r.write(
      '.claude/agent-memory/code-reviewer/MEMORY.md',
      '| drift | types.ts cited as "1806-line" - correct |\n',
    )
    r.write(
      '.claude/limits.json',
      '{ "note": "types.ts is GENERATED (1806 lines) - the generator owns it" }\n',
    )
    r.write(
      '.claude/hooks/check-file-size-guard.test.mjs',
      '// a 1806-line GENERATED file is reported\n',
    )
    r.git('add', '-A')
    assertColorBlobDiffActive(r.dir, '.claude/limits.json')
    assert.equal(run(r, 'fix: correct the count everywhere\n').status, 0)
  })
})

/**
 * Prove `color.ui always` is ACTIVE on completedSpecDirs' exact `git grep -l -z` invocation
 * (the `- [ ]` open-task search over `tasks.md`), before trusting a test built on it: without
 * `--no-color`, a matched path must carry an ANSI escape; with it, none.
 */
function assertColorSpecGrepActive(dir, pattern) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  const grepArgs = [
    'grep',
    '-l',
    '-z',
    '--full-name',
    '-F',
    '-e',
    pattern,
    '--cached',
    '--',
    ':(top).spec-workflow/specs/*/tasks.md',
  ]
  const hidden = git(...grepArgs)
  const shown = git(grepArgs[0], grepArgs[1], grepArgs[2], '--no-color', ...grepArgs.slice(3))
  // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ANSI escape is present
  assert.match(hidden, /\x1b\[/)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the ANSI escape is absent
  assert.doesNotMatch(shown, /\x1b\[/)
}

// GROUP: check-retracted-phrase-always-passes, check-retracted-phrase-color-blobdiff, check-retracted-phrase-color-grep, check-retracted-phrase-color-specgrep
test('a LIVE spec still counts as a survivor under color.ui=always, exactly as without it', () => {
  // MUTATION: dropping --no-color from completedSpecDirs' `git grep -l -z` lets a local
  // `color.ui always` wrap every matched tasks.md path in ANSI escapes; the wrapped path then
  // never matches any spec directory prefix, so a LIVE spec is treated as fully completed and
  // excluded from the corpus — a retraction still standing in a live spec goes unreported.
  withRepo((r) => {
    r.write('.claude/limits.json', '{ "note": "value 1807" }\n')
    r.write('.spec-workflow/specs/live/tasks.md', '- [ ] still open\nthe value 1807 is used here\n')
    r.git('add', '-A')
    r.git('commit', '-qm', 'init')
    r.git('config', 'color.ui', 'always')
    r.write('.claude/limits.json', '{ "note": "value 1806" }\n')
    r.git('add', '-A')
    assertColorSpecGrepActive(r.dir, '- [ ]')
    const { status, stderr } = run(r, 'fix: correct it\n')
    assert.equal(status, 1, 'a live spec is part of the corpus under color.ui=always too')
    assert.match(stderr, /retracted the value `1807`/)
  })
})
