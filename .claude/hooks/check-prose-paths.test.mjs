// Run: node --test .claude/hooks/check-prose-paths.test.mjs
//
// Pure decision logic for the prose-paths guard: token recognition, the six structural
// narrowings, the exclusion classes, waivers, baseline keys and argument parsing. Nothing
// here spawns a process or touches git — those paths live in
// check-prose-paths.repo.test.mjs, so neither file approaches the test-file cap in
// .claude/limits.json.
//
// ONE filesystem read remains, and it is deliberate. The sentinel below misses both index
// sets, so `resolves` falls through to its `existsSync` tail (`grep -n 'return existsSync(t)'
// .claude/hooks/check-prose-paths.mjs` — a predicate, because the line number drifts). The
// sentinel must stay absent from the run's cwd, exactly as check-prose-paths.repo.test.mjs
// states for its own direct-evaluate cases.
// The sentinel is docs/gone.md // prose-path-ok: it MUST NOT resolve — it IS the miss case that drives `resolves` to its filesystem tail, so a repo where it resolved would silently void the assertion
//
// Every case is MUTATION-PINNED: the opening comment names the break that turns it red, and
// every break was EXECUTED before being written down (`code-style.md` §7 — a `MUTATION:` line
// is a prose claim). Some breaks redden a GROUP of cases rather than one; those carry a
// `GROUP:` marker naming the mutation id. The EXACT set each break reddens is DATA, in
// check-prose-paths.mutations.json, and `node .claude/hooks/run-mutations.mjs --guard
// check-prose-paths` re-derives it — do not hand-maintain a second copy here.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildIndex,
  classify,
  corpusFiles,
  inPathCorpus,
  looksLikePath,
  main,
  normalise,
  PATH_RE,
  parseWaiver,
  pathKey,
  prosePathLines,
  resolves,
  stagedPaths,
  staleBaselineEntries,
} from './check-prose-paths.mjs'

/** A tracked-file fixture, so no case depends on the live tree. */
const TRACKED = [
  'apps/web/lib/report-queries/report.ts',
  'docs/plan.md',
  '.claude/hooks/check-prose-paths.mjs',
  'supabase/migrations/20260311000001_initial_schema.sql',
]

const INDEX = buildIndex(TRACKED)
const TOP = INDEX.toplevel

/** Tokens the regex recognises on one line, before any narrowing is applied. */
const tokens = (line) => [...line.matchAll(PATH_RE)].map((m) => m[1])

/** Classify with the gitignore oracle pinned, so no case depends on a real `.gitignore`. */
const cls = (tok, line = 'prose', ignored = false) => classify(tok, line, INDEX, () => ignored)

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

// ---------------------------------------------------------------- the six narrowings

test('rejects a leading slash as a token that names nothing in the repo', () => {
  // MUTATION: replace the `tok.startsWith('/')` return in looksLikePath with `if (false)` →
  // `/docs/plan.md` reads as a repo path. The fixture carries a known extension on purpose:
  // an absolute token WITHOUT one (`/usr/bin/env`) is already rejected by the top-level test
  // three lines further down, so it cannot reach this mechanism and would survive the break.
  assert.equal(looksLikePath('/docs/plan.md', TOP), false)
  assert.equal(looksLikePath('docs/plan.md', TOP), true)
})

test('rejects an npm specifier at the regex rather than by a later rule', () => {
  // MUTATION: drop `@` from PATH_RE's lookbehind character class → the specifier is admitted
  // at its SECOND segment, which is a token nobody wrote and which resolves nowhere.
  assert.deepEqual(tokens('import from @repo/ui/question-card.tsx here'), [])
})

test('requires two non-empty segments, so a bare name is not a location', () => {
  // MUTATION: relax looksLikePath's `segs.length < 2` to `< 1` → `plan.md` and every
  // `Next.js`-shaped English word with a matching extension become path claims.
  assert.equal(looksLikePath('plan.md', TOP), false)
  assert.equal(looksLikePath('Next.js', TOP), false)
})

test('requires a path shape: an extension, a trailing slash, a glob or a real top-level entry', () => {
  // MUTATION: make looksLikePath's final `toplevel.has(segs[0])` return `true` → English
  // alternation (`status/summary`, `origin/master`) is counted as a path, which calibration
  // measured as the single largest false class.
  assert.equal(looksLikePath('status/summary', TOP), false)
  assert.equal(looksLikePath('origin/master', TOP), false)
  assert.equal(looksLikePath('apps/web/nope', TOP), true, 'apps is a real top-level entry')
  assert.equal(looksLikePath('docs/guide/', TOP), true, 'trailing slash')
  assert.equal(looksLikePath('docs/*', TOP), true, 'glob tail')
})

// GROUP: extension-alternation-shortest-first-and-no-lookahead
test('keeps a long extension whole instead of truncating it to a shorter one', () => {
  // MUTATION: rebuild PATH_RE with the extension alternation sorted SHORTEST-first AND the
  // trailing `(?![\w-])` removed. Both halves are required: sorted shortest-first alone still
  // matches `a.tsx`, because the lookahead refuses the `x` left over after `.ts` and the engine
  // backtracks. Verified by executing each half separately — neither changes this line.
  assert.deepEqual(tokens('a.tsx'), ['a.tsx'])
  assert.deepEqual(tokens('my.json'), ['my.json'])
})

// GROUP: extension-alternation-shortest-first-and-no-lookahead
test('refuses an extension glued to further word characters', () => {
  // MUTATION: delete PATH_RE's trailing `(?![\w-])` → `a.ts-b` yields `a.ts` and `my.json5`
  // yields `my.json`, both tokens nobody wrote, which then fail to resolve and are reported.
  assert.deepEqual(tokens('a.ts-b'), [])
  assert.deepEqual(tokens('my.json5'), [])
})

// GROUP: directory-suffixes-not-indexed, context-relative-suffix-lookup-removed
test('resolves a reference relative to a directory under discussion', () => {
  // MUTATION: drop the `for (const d of dirSet)` suffix loop in buildIndex → the directory
  // token below stops being a tail of a real DIRECTORY and is reported as a dead path.
  // Narrowing 5: the file-suffix half alone still resolves the second token, so only the first
  // line reddens. Neither token is all-alphabetic, so the english-alternation branch cannot
  // reach them and its own break leaves this case green — measured, after it did not.
  assert.equal(cls('lib/report-queries/'), 'context-relative')
  assert.equal(cls('report-queries/report.ts'), 'context-relative')
})

test('counts a tracked file and a tracked directory as resolving', () => {
  // MUTATION: drop `index.dirSet.has(t)` from resolves → a citation of a directory that holds
  // tracked files becomes a candidate, and the run is dominated by correct prose. The fixture
  // directory is one that exists in NO worktree: `resolves` falls back to `existsSync`, so a
  // path that is also on disk survives the break and reports nothing.
  assert.equal(resolves('docs/plan.md', INDEX), true)
  assert.equal(resolves('apps/web/lib/report-queries', INDEX), true)
  assert.equal(resolves('docs/gone.md', INDEX), false)
})

test('strips a ./ prefix before any index lookup so a ./- prefixed citation resolves correctly', () => {
  // normalise is exported (not just internal) so measure-prose-paths.mjs can import it —
  // a second copy there would diverge on the first regex edit and silently move tokens
  // between the classes it counts (commit 82cdba3d).
  //
  // MUTATION: remove the .replace(/^\.\//, '') term from normalise. Verified by execution in a
  // scratch copy: exactly one test fails and it is THIS one — no other case reddens. It fails
  // on the FIRST assertion — normalise returns './docs/plan.md' unstripped — so the cls()
  // assertion is NOT reached under this mutation. cls() pins the end-to-end path separately:
  // a ./-prefixed token misses every index set (trackedSet, dirSet and suffixes all hold
  // paths without the prefix) and classify, which has no existsSync fallback of its own,
  // would report 'unresolved' instead of 'context-relative'.
  assert.equal(normalise('./docs/plan.md'), 'docs/plan.md')
  assert.equal(cls('./docs/plan.md'), 'context-relative')
})

// ---------------------------------------------------------------- exclusion classes

// GROUP: glob-class-removed, placeholder-class-removed, brace-expansion-class-removed
test('names the pattern-shaped classes rather than reporting them', () => {
  // MUTATION: neutralise any one of classify's GLOB, PLACEHOLDER or brace-expansion branches
  // → that shape falls through to `unresolved` and blocks a commit over prose that asserts a
  // pattern, a stand-in name, or a fragment of a shell word — none of which name a file.
  assert.equal(cls('.claude/hooks/*.mjs'), 'glob')
  assert.equal(cls('apps/**'), 'glob')
  assert.equal(cls('path/to/x.ts'), 'placeholder')
  assert.equal(cls('<name>/x.ts'), 'placeholder')
  assert.equal(cls('a{b}/c.ts'), 'brace-expansion')
})

// GROUP: parent-relative-class-removed, url-class-removed, npm-class-removed,
// frozen-historical-class-removed, node-modules-class-removed
test('names the provenance classes rather than reporting them', () => {
  // MUTATION: neutralise any one of classify's context-relative, URL, npm-specifier,
  // frozen-historical or node_modules branches → prose that cites a parent-relative path, a
  // link, a package specifier, the FROZEN packages/db/migrations tree, or a dependency's own
  // file is reported as a dead repo path.
  assert.equal(cls('../x/y.md'), 'context-relative')
  assert.equal(cls('docs/x.md', 'see https://example.com/docs/x.md today'), 'URL')
  assert.equal(cls('@scope/pkg/x.ts'), 'npm-package-specifier')
  assert.equal(cls('packages/db/migrations/old.sql'), 'frozen-historical')
  assert.equal(cls('node_modules/react/index.js'), 'node_modules')
})

// GROUP: gitignored-class-removed
test('names a gitignored artifact rather than reporting it', () => {
  // MUTATION: neutralise classify's `isIgnored(t)` branch → every generated or runtime
  // artifact named in prose is reported, and the remedy is a waiver on each one.
  assert.equal(cls('apps/web/.next/build.js', 'prose', true), 'gitignored-artifact')
})

test('names the English-shaped classes but keeps a directory reference reportable', () => {
  // MUTATION: drop the `!tok.endsWith('/')` term from the english-alternation test → a
  // genuinely dead directory citation, all-alphabetic and slash-terminated like the second
  // token below, is swallowed as English alternation — which the guard's own comment records
  // as the worse failure, because it hides findings and nothing downstream can tell.
  assert.equal(cls('user/session/question'), 'english-alternation')
  assert.equal(cls('docs/guide/'), 'unresolved')
})

// GROUP: slash-joined-list-class-removed, migration-prefix-class-removed
test('names a slash-joined filename list and a migration timestamp reference', () => {
  // MUTATION: neutralise classify's slash-joined-list or migration-prefix branch → the
  // `tech.md/decisions.md` shape, and the timestamp-prefix form every rule file uses to cite
  // a migration, both block commits over prose that names no file.
  assert.equal(cls('tech.md/decisions.md'), 'slash-joined-list')
  assert.equal(cls('supabase/migrations/20260410000009'), 'migration-prefix-ref')
  assert.equal(cls('supabase/migrations/2026041000000900'), 'unresolved', '16 digits is not one')
})

// ---------------------------------------------------------------- prose extraction

test('grades a yaml file whole, not only its comment lines', () => {
  // MUTATION: delete prosePathLines's `.yaml`/`.yml` branch → `.coderabbit.yaml`'s
  // path_instructions, which are hand-written prose inside yaml STRINGS, drop out of scope.
  assert.equal(prosePathLines('.coderabbit.yaml', '- path: docs/x.md').length, 1)
  assert.equal(prosePathLines('docs/a.md', 'see docs/x.md').length, 1)
  assert.deepEqual(prosePathLines('.claude/data.json', '{ "a": "docs/x.md" }'), [])
})

// ---------------------------------------------------------------- corpus

// GROUP: spec-tree-not-excluded
test('excludes the spec tree and keeps steering', () => {
  // MUTATION: delete the SPEC_PREFIX test in inPathCorpus → a spec's design/tasks docs, whose
  // whole job is naming files BEFORE they are built, are graded as stale citations.
  assert.equal(inPathCorpus('.spec-workflow/specs/x/design.md'), false)
  assert.equal(inPathCorpus('.spec-workflow/steering/tech.md'), true)
})

test('excludes a data file, which has no prose to grade', () => {
  // MUTATION: delete the DATA_EXT test in inPathCorpus → this guard's own baseline, a list of
  // quoted dead paths, is read as prose and every row becomes a finding about itself.
  assert.equal(inPathCorpus('.claude/prose-paths.json'), false)
  assert.deepEqual(corpusFiles(['docs/a.md', '.claude/x.json']), ['docs/a.md'])
})

// ---------------------------------------------------------------- waivers

test('accepts an inline waiver carrying a written reason', () => {
  // MUTATION: delete the WAIVER_RE branch in parseWaiver → the escape hatch disappears, and
  // the only remedy for prose that must name an absent file becomes a baseline row.
  // GROUP: waiver-never-recognised
  assert.deepEqual(
    parseWaiver('x <!-- prose-path-ok: this names the file a later commit deletes -->'),
    { reason: 'this names the file a later commit deletes' },
  )
  assert.equal(parseWaiver('x — no marker here'), null)
})

test('rejects a waiver whose reason asserts nothing', () => {
  // MUTATION: delete the length floor and the EMPTY_REASONS test from parseWaiver →
  // `// prose-path-ok: ok` suppresses a finding at zero cost.
  // GROUP: waiver-never-recognised, waiver-reason-floor-removed
  for (const r of ['ok', 'false positive', 'noise', 'too short']) {
    assert.ok(parseWaiver(`// prose-path-ok: ${r}`).problem, r)
  }
})

// ---------------------------------------------------------------- baseline keys

test('keys a finding on its line content, not on its line number or spacing', () => {
  // MUTATION: drop the `.trim()` from pathKey's hash input → re-indenting a bullet invalidates
  // its baseline row, so an edit that never touched the citation reports a stale row.
  assert.equal(
    pathKey('docs/x.md', '  see docs/gone.md  '),
    pathKey('docs/x.md', 'see docs/gone.md'),
  )
  assert.notEqual(
    pathKey('docs/x.md', 'see docs/gone.md'),
    pathKey('docs/y.md', 'see docs/gone.md'),
  )
})

test('keys a repeated identical line separately from its first occurrence', () => {
  // MUTATION: make pathKey ignore `occurrence` (return the bare key always) → once the first
  // copy is baselined, a second identical dead citation inherits its row and is admitted.
  assert.notEqual(
    pathKey('docs/x.md', 'see docs/gone.md', 1),
    pathKey('docs/x.md', 'see docs/gone.md'),
  )
})

test('reports a baseline row that describes no live finding as stale', () => {
  // MUTATION: return `[]` from staleBaselineEntries → the ratchet stops being shrink-only, and
  // a corrected citation leaves its row behind forever with nothing noticing.
  const findings = new Map([['docs/a.md@0123456789abcdef', {}]])
  assert.deepEqual(
    staleBaselineEntries(findings, {
      'docs/a.md@0123456789abcdef': 'live',
      'docs/a.md@deadbeefdeadbeef': 'gone',
    }),
    ['docs/a.md@deadbeefdeadbeef'],
  )
})

// ---------------------------------------------------------------- staged enumeration

test('takes both paths of a staged rename', () => {
  // MUTATION: set `count` to 1 unconditionally in stagedPaths → the NUL stream desyncs on the
  // first rename, the destination is read as the next status token, fails the `/^[A-Z]\d*$/`
  // shape, and the desync check THROWS. Traced, not predicted: silent wrong scoping at exit 0
  // is what that check PREVENTS, not what this break produces — the case below pins the check.
  const raw = Buffer.from(
    ['M', 'docs/a.md', 'R100', 'docs/old.md', 'docs/new.md', 'A', 'docs/c.md', ''].join('\0'),
  )
  assert.deepEqual(stagedPaths(raw), ['docs/a.md', 'docs/old.md', 'docs/new.md', 'docs/c.md'])
})

test('aborts on a desynchronised name-status stream', () => {
  // MUTATION: `continue` instead of throwing on an unrecognised status → a desync is absorbed
  // and the guard grades a scope nobody chose, at exit 0.
  assert.throws(() => stagedPaths(Buffer.from(['M', 'a.md', 'b.md'].join('\0'))), /unrecognised/)
})

// ---------------------------------------------------------------- argument parsing

test('refuses a positional argument, because the guard self-enumerates', () => {
  // MUTATION: delete the `positional.length > 0` branch in main → a caller passing a filtered
  // file list reopens the hole self-enumeration closes, and the omitted file is never read.
  const res = capture(['docs/a.md'])
  assert.equal(res.code, 2)
  assert.match(res.err, /takes flags only/)
})

test('refuses an unknown flag', () => {
  // MUTATION: delete the `unknown.length > 0` branch in main → a typo (`--updat-baseline`) is
  // ignored and the run silently does something other than what was asked.
  const res = capture(['--bogus'])
  assert.equal(res.code, 2)
  assert.match(res.err, /unknown flag/)
})

test('refuses two modes in one invocation', () => {
  // MUTATION: delete the `new Set(flags).size > 1` branch in main → whichever branch is tested
  // first wins and the other request is dropped with no diagnostic.
  const res = capture(['--all', '--update-baseline'])
  assert.equal(res.code, 2)
  assert.match(res.err, /separate modes/)
})
