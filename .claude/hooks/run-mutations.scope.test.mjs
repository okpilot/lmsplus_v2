// Run: node --test .claude/hooks/run-mutations.scope.test.mjs
//
// The PURE scope predicates behind `--staged`: `relPath`, `localImports`, `namedPaths` and
// `touchesStaged` itself, pinned with a controllable fake reader and no git at all. Split from
// run-mutations.staged.test.mjs at the test-file cap in .claude/limits.json, which keeps the
// end-to-end `--staged` cases — the ones that need a real repo and a real spawn — over there.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { after } from 'node:test'
import { blobAt, localImports, namedPaths, relPath, touchesStaged } from './run-mutations.mjs'

/** A fake `readAt`, keyed by root-relative path — no real git, no worktree. */
function fakeReader(root, files) {
  return (p) => {
    const rel = relPath(root, p)
    return Object.hasOwn(files, rel) ? files[rel] : null
  }
}

const fixtureDirs = []
after(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// touchesStaged — the scope predicate
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('touchesStaged matches on the data file itself, its target, or a suite', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = {
    target: '.claude/hooks/x.mjs',
    suites: ['.claude/hooks/x.test.mjs'],
    mutations: [],
  }
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.mjs'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.test.mjs'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/x.mutations.json'])), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/hooks/unrelated.mjs'])), false)
})

test('relPath renders an absolute path under root as root-relative POSIX', () => {
  assert.equal(relPath('/repo', '/repo/.claude/hooks/x.mjs'), '.claude/hooks/x.mjs')
  assert.equal(relPath('/repo', '.claude/hooks/x.mjs'), '.claude/hooks/x.mjs')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// localImports and the scope reach
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('localImports resolves relative specifiers against the importer, and skips bare ones', () => {
  const text = [
    "import { a } from './kit.mjs'",
    "import { b } from '../up/kit.mjs'",
    "const c = await import('./dyn.mjs')",
    "import assert from 'node:assert/strict'",
  ].join('\n')
  assert.deepEqual(localImports('/repo', '/repo/hooks/x.test.mjs', text), [
    'hooks/kit.mjs',
    'up/kit.mjs',
    'hooks/dyn.mjs',
  ])
})

test('namedPaths collects repo-relative path literals and skips bare module specifiers', () => {
  const text = [
    "const L = JSON.parse(readFileSync('.claude/limits.json', 'utf8'))",
    "import assert from 'node:assert/strict'",
    ['const computed = `./fixtures/', '${', 'name}.mjs`'].join(''),
  ].join('\n')
  assert.deepEqual(namedPaths(text), ['.claude/limits.json'])
})

// MUTATION: delete `touchesStaged`'s `namedPaths` branch → a suite that READS a file by literal
// path rather than importing it (`readFileSync('.claude/limits.json')`) declares that dependency
// nowhere the scope predicate can see, so a commit staging only that file grades nothing, exits 0,
// and reports success while the edit can redden the suites the corpus pins.
// GROUP: touchesstaged-no-named-paths
test('a suite is in scope when a file it reads by literal path is the only staged file', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = () => "const L = JSON.parse(readFileSync('.claude/limits.json', 'utf8'))\n"
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/limits.json']), readAt), true)
  assert.equal(touchesStaged(root, file, data, new Set(['.claude/other.json']), readAt), false)
})

// MUTATION: neuter `touchesStaged`'s `localImports` branch → a commit staging only a shared
// testkit matches no data file's own path, target or suite, so the run grades nothing and exits 0
// while the edit can redden every suite importing it.
// GROUP: touchesstaged-no-import-hop
test('a suite is in scope when a helper it imports is the only staged file', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = () => "import { kit } from './kit.mjs'\n"
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/kit.mjs']), readAt), true)
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/other.mjs']), readAt), false)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// namedPaths — quote character coverage and slash-segment guard
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: remove the backtick from the namedPaths quote character class so it reads /['"]...['"]/ →
// a path in a template literal without ${} is never extracted; a suite that reads a file via a
// backtick literal (e.g. `readFileSync(\`.claude/limits.json\`)`) declares no dependency the scope
// predicate can see, and a commit staging only that file exits 0 without grading.
// GROUP: namedpaths-backtick-quote
test('namedPaths extracts a backtick-quoted path literal without a substitution', () => {
  const text = "const data = readFileSync(`.claude/limits.json`, 'utf8')"
  assert.deepEqual(namedPaths(text), ['.claude/limits.json'])
})

// MUTATION: remove the double-quote from the namedPaths quote character class so it reads /['`]...['`]/ →
// a path in a double-quoted string is never extracted; a dependency declared as "path/to/file.json"
// is invisible to the scope predicate.
// GROUP: namedpaths-double-quote
test('namedPaths extracts a double-quoted path literal', () => {
  assert.deepEqual(namedPaths('readFileSync("path/to/fixture.json", "utf8")'), [
    'path/to/fixture.json',
  ])
})

// MUTATION: change the `+` to `*` on namedPaths's `(?:\/[\w.-]+)+` group → single-segment names
// with no slash (e.g. 'foo.mjs', 'assert') match and are returned as if they were paths, producing
// spurious scope matches for any staged file whose basename coincidentally matches.
// GROUP: namedpaths-slash-required
test('namedPaths rejects a single-segment name with no path separator', () => {
  assert.deepEqual(namedPaths("const x = require('foo.mjs')"), [])
  assert.deepEqual(namedPaths('const x = require("bar.json")'), [])
})

// MUTATION: remove `if (text === null) return false` from touchesStaged's suites loop →
// readAt returning null causes null.matchAll() to throw, propagating an unhandled error
// where a false (not-in-scope) result is expected — a suite absent at the ref errors the whole
// filter instead of being silently excluded.
// GROUP: touchesstaged-null-readat
test('touchesStaged returns false when readAt returns null for all suites', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  // readAt returning null models a suite absent at the index ref
  const readAt = () => null
  // staged has a path that could only match via readAt (import/named-path hop, not direct)
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/kit.mjs']), readAt), false)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// reachable / touchesStaged — the TRANSITIVE walk (#1329), never just one hop
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// MUTATION: in `reachable`, stop pushing `imp` onto the queue (collect it into `found` but never
// walk further) → the walk drops back to ONE hop, and a commit staging only a file TWO imports
// away from a suite grades nothing and exits 0 while the edit can redden the suite.
// GROUP: reachable-two-hop-suite-chain
test('touchesStaged follows a suite import chain two hops deep', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = fakeReader(root, {
    'hooks/x.test.mjs': "import { a } from './a.mjs'\n",
    'hooks/a.mjs': "import { b } from './b.mjs'\n",
    'hooks/b.mjs': 'export const b = 1\n',
  })
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/b.mjs']), readAt), true)
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/unrelated.mjs']), readAt), false)
})

// MUTATION: delete the `reachable(root, [data.target], readAt, false)` walk from `touchesStaged`
// → #1329 regresses: a commit staging only a helper the TARGET imports (never the suite) grades
// nothing and exits 0 while the edit can redden every suite that exercises the target.
// GROUP: touchesstaged-target-own-imports
test("touchesStaged follows the target's own imports, not only a suite's", () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = fakeReader(root, {
    'hooks/x.mjs': "import { k } from './kit.mjs'\n",
    'hooks/x.test.mjs': 'no imports here\n',
  })
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/kit.mjs']), readAt), true)
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/other.mjs']), readAt), false)
})

// Smoke test, no MUTATION claim: deleting `reachable`'s `visited.has(rel)` guard would turn this
// into an unbounded synchronous loop rather than a red test — encoding it as a graded mutation
// would make every run of this corpus hang for the full SUITE_TIMEOUT_MS and FAULT, never CAUGHT.
// This only confirms the walk actually terminates on a cycle, which is the precondition for the
// two tests above to mean anything at all.
test('touchesStaged terminates on an import cycle instead of looping forever', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = fakeReader(root, {
    'hooks/x.test.mjs': "import { a } from './a.mjs'\n",
    'hooks/a.mjs': "import { b } from './b.mjs'\n",
    'hooks/b.mjs': "import { a } from './a.mjs'\n",
  })
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/unrelated.mjs']), readAt), false)
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/a.mjs']), readAt), true)
})

// MUTATION: delete the `abs !== root && !abs.startsWith(root + sep)` guard in `localImports` →
// a specifier resolving outside the repo root reaches `relPath`, which THROWS — a suite or target
// importing anything via a `../` chain that escapes root (a symlinked shim, a monorepo sibling)
// faults the whole `--staged` run instead of the walk simply skipping what it cannot follow.
// GROUP: localimports-skips-out-of-root
test('localImports skips a specifier resolving outside the repo root, rather than throwing', () => {
  const root = '/repo'
  const text = "import { x } from '../../etc/passwd.mjs'\n"
  assert.deepEqual(localImports(root, 'hooks/f.mjs', text), [])
})

test('touchesStaged does not throw when a reached file imports outside the repo root', () => {
  const root = '/repo'
  const file = { path: '/repo/.claude/hooks/x.mutations.json' }
  const data = { target: 'hooks/x.mjs', suites: ['hooks/x.test.mjs'], mutations: [] }
  const readAt = fakeReader(root, {
    'hooks/x.test.mjs': "import { x } from '../../etc/passwd.mjs'\nimport { k } from './kit.mjs'\n",
    'hooks/kit.mjs': 'export const k = 1\n',
  })
  assert.doesNotThrow(() => touchesStaged(root, file, data, new Set(['hooks/kit.mjs']), readAt))
  assert.equal(touchesStaged(root, file, data, new Set(['hooks/kit.mjs']), readAt), true)
})

// MUTATION: drop the `.replace(/^(?:\.\/)+/, '')` strip from `namedPaths` → a literal spelled with
// a leading `./` (`readFileSync('./.claude/limits.json')`) never equals the root-relative form
// every caller stages against, so a commit staging only that file grades nothing and exits 0.
// GROUP: namedpaths-strips-leading-dot-slash
test('namedPaths strips a leading ./ so the literal matches the root-relative staged path', () => {
  assert.deepEqual(namedPaths("readFileSync('./.claude/limits.json', 'utf8')"), [
    '.claude/limits.json',
  ])
  assert.deepEqual(namedPaths('readFileSync(`././fixtures/a.json`)'), ['fixtures/a.json'])
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// blobAt — the fault/absence distinction the scope walk rests on. `git cat-file -e` exits 128 for
// BOTH an absent path and an unresolvable ref, so a probe built on it reports a broken ref as an
// empty scope and the run exits 0 having graded nothing. These three cases are that distinction.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function blobRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-blobat-'))
  fixtureDirs.push(dir)
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  g('init', '-q', '.')
  g('config', 'user.email', 't@t')
  g('config', 'user.name', 't')
  mkdirSync(join(dir, 'a'), { recursive: true })
  writeFileSync(join(dir, 'a', 'present.mjs'), 'export const present = 1\n')
  g('add', '-A')
  g('commit', '-qm', 'seed')
  return { dir, g }
}

// MUTATION: change blobAt's `if (probe.stdout.trim() === '') return null` to `return null` → every
// path reads as absent, so no data file ever loads and a --staged run grades nothing.
// GROUP: blobat-always-null
test('blobAt returns a tracked file content at the ref', () => {
  const { dir } = blobRepo()
  assert.match(blobAt(dir, 'HEAD', join(dir, 'a/present.mjs')), /export const present = 1/)
})

// MUTATION: delete blobAt's `if (probe.stdout.trim() === '') return null` → an absent path reaches
// `git show`, which throws instead of returning null.
// GROUP: blobat-absent-returns-null
test('blobAt returns null for a path absent from an otherwise valid tree', () => {
  const { dir } = blobRepo()
  assert.equal(blobAt(dir, 'HEAD', join(dir, 'a/missing.mjs')), null)
})

// MUTATION: change blobAt's `if (probe.status !== 0) throw ...` to `return null` → an unresolvable
// ref reads as "this path is absent" instead of faulting, so one bad ref empties the whole scope
// and the run reports nothing to grade and exits 0.
// GROUP: blobat-fault-is-not-absence
test('blobAt throws on an unresolvable ref rather than reporting the path absent', () => {
  const { dir } = blobRepo()
  assert.throws(() => blobAt(dir, 'nosuchref', join(dir, 'a/present.mjs')), /cannot read/)
})

// MUTATION: delete relPath's escape-guard `throw` → a path outside root slices into a wrong
// string, and every caller feeds that string to `staged.has(...)`, where "wrong string" and "not
// staged" are the same answer. Scope narrows with no diagnostic.
// GROUP: relpath-escape-guard
test('relPath throws on a path outside the repo root rather than returning a wrong string', () => {
  assert.throws(() => relPath('/repo', '/elsewhere/x.mjs'), /escapes the repo root/)
})

// MUTATION: delete blobAt's `if (probe.error) throw probe.error` → a spawn that never ran leaves
// status null, so the status branch reports "git ls-tree exited null" and discards the ENOENT
// that is the only diagnostic. The call still faults, so this is about what the fault SAYS.
// GROUP: blobat-surfaces-spawn-error
test('blobAt surfaces the spawn error rather than reporting a null exit status', () => {
  assert.throws(
    () => blobAt('/nonexistent-root-for-blobat', 'HEAD', '/nonexistent-root-for-blobat/a.mjs'),
    {
      code: 'ENOENT',
    },
  )
})
