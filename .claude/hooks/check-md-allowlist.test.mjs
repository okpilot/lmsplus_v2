// Run: node --test .claude/hooks/check-md-allowlist.test.mjs
//
// Pure decision logic for the md-allowlist guard: markdown detection, the allow decision, the
// spec re-include parser, and the CLI's flag parsing. Nothing here spawns a process or touches
// git — that path lives in check-md-allowlist.repo.test.mjs.
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-md-allowlist.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-md-allowlist` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import test from 'node:test'
import { isAllowed, isMarkdown, main, specDirsFrom } from './check-md-allowlist.mjs'

const ALLOW = {
  dirs: ['.claude/rules/', '.claude/agents/'],
  files: ['docs/security.md'],
  basenames: ['CLAUDE.md', 'README.md'],
}

// ---------------------------------------------------------------- markdown detection

// GROUP: md-ext-narrowed
test('recognises the three markdown extensions, case-insensitively', () => {
  // MUTATION: narrow MD_EXT_RE to `/\.md$/i` → .mdx and .markdown files stop being candidates
  // and a new tracked doc under either extension ships unchecked.
  assert.equal(isMarkdown('docs/a.md'), true)
  assert.equal(isMarkdown('docs/a.MD'), true)
  assert.equal(isMarkdown('docs/a.mdx'), true)
  assert.equal(isMarkdown('docs/a.markdown'), true)
  assert.equal(isMarkdown('docs/a.ts'), false)
})

// ---------------------------------------------------------------- allow decision

// GROUP: dirs-branch-dropped
test('allows a path under a listed directory prefix', () => {
  // MUTATION: drop the `allow.dirs.some(...)` branch from isAllowed → every rules/agents file
  // is reported as a new offender, and the folder allowlist stops meaning anything.
  assert.equal(isAllowed('.claude/rules/x.md', ALLOW, new Set()), true)
  assert.equal(isAllowed('.claude/rulesx/x.md', ALLOW, new Set()), false, 'no sibling-prefix match')
})

// GROUP: files-branch-dropped
test('allows an exact listed file but not its sibling', () => {
  // MUTATION: drop the `allow.files.includes(path)` branch from isAllowed → docs/security.md,
  // named nowhere else in the allowlist, is reported as a new offender.
  assert.equal(isAllowed('docs/security.md', ALLOW, new Set()), true)
  assert.equal(isAllowed('docs/other.md', ALLOW, new Set()), false)
})

// GROUP: basenames-branch-dropped
test('allows a listed basename under any directory', () => {
  // MUTATION: drop the `allow.basenames.includes(...)` branch from isAllowed → every nested
  // README.md/CLAUDE.md is reported as a new offender.
  assert.equal(isAllowed('CLAUDE.md', ALLOW, new Set()), true)
  assert.equal(isAllowed('apps/web/README.md', ALLOW, new Set()), true)
  assert.equal(isAllowed('apps/web/NOTES.md', ALLOW, new Set()), false)
})

// GROUP: specdirs-loop-dropped
test('allows a path under a re-included spec directory', () => {
  // MUTATION: drop the `for (const d of specDirs)` loop from isAllowed → every spec doc,
  // re-included in .gitignore for exactly this purpose, is reported as a new offender.
  const specDirs = new Set(['.spec-workflow/specs/backlog-burndown/'])
  assert.equal(isAllowed('.spec-workflow/specs/backlog-burndown/tasks.md', ALLOW, specDirs), true)
  assert.equal(isAllowed('.spec-workflow/specs/other/tasks.md', ALLOW, specDirs), false)
})

// GROUP: isallowed-fallback-inverted
test('blocks a path matching none of the allowed shapes', () => {
  // NON-VACUITY for the group above: a genuinely unlisted path must still be reportable.
  // MUTATION: invert isAllowed's final `return false` to `return true` → every path matching
  // none of the allowed shapes is nonetheless treated as allowed, and the guard blocks nothing.
  assert.equal(isAllowed('docs/notes.md', ALLOW, new Set()), false)
})

// ---------------------------------------------------------------- spec re-include parsing

// GROUP: spec-reinclude-no-trailing-slash
test('parses a spec re-include line into its directory prefix', () => {
  // MUTATION: drop the trailing `/` from SPEC_REINCLUDE_RE → the returned prefix no longer ends
  // in '/', so `isAllowed`'s startsWith check stops matching any file under that spec at all.
  const text = '.work/\n.spec-workflow/specs/*\n!.spec-workflow/specs/backlog-burndown/\n'
  assert.deepEqual(specDirsFrom(text), new Set(['.spec-workflow/specs/backlog-burndown/']))
})

// GROUP: spec-reinclude-requires-bang
test('requires the leading ! — a plain gitignore entry is not a re-include', () => {
  // MUTATION: make the leading `!` optional in SPEC_REINCLUDE_RE (`^!?` instead of `^!`) → an
  // ordinary, never-negated gitignore entry naming a spec directory reads as a re-include.
  const text = '.spec-workflow/specs/demo/\n'
  assert.deepEqual(specDirsFrom(text), new Set())
})

// GROUP: spec-reinclude-no-trim
test('trims surrounding whitespace before matching a re-include line', () => {
  // MUTATION: drop `.trim()` before SPEC_REINCLUDE_RE.exec → an indented re-include line (or one
  // carrying a trailing space) is no longer recognised, and its spec directory is dropped.
  const text = '  !.spec-workflow/specs/study-mode/  \n'
  assert.deepEqual(specDirsFrom(text), new Set(['.spec-workflow/specs/study-mode/']))
})

// ---------------------------------------------------------------- argument parsing

/** Run the CLI's argument parser in-process, capturing its diagnostics. */
function capture(args) {
  const real = console.error
  const lines = []
  console.error = (...a) => lines.push(a.join(' '))
  try {
    return { code: main(args), err: lines.join('\n') }
  } finally {
    console.error = real
  }
}

// GROUP: main-positional-check-dropped
test('refuses a positional argument, because the guard self-enumerates', () => {
  // MUTATION: delete the `positional.length > 0` branch in main → a caller passing a filtered
  // file list reopens the hole self-enumeration closes, and the omitted file is never read.
  const res = capture(['docs/a.md'])
  assert.equal(res.code, 2)
  assert.match(res.err, /takes flags only/)
})

// GROUP: main-unknown-flag-check-dropped
test('refuses an unknown flag', () => {
  // MUTATION: delete the `unknown.length > 0` branch in main → a typo (`--al`) is ignored and
  // the run silently does something other than what was asked.
  const res = capture(['--bogus'])
  assert.equal(res.code, 2)
  assert.match(res.err, /unknown flag/)
})
