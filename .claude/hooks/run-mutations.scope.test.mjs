// Run: node --test .claude/hooks/run-mutations.scope.test.mjs
//
// The PURE scope predicates behind `--staged`: `relPath`, `localImports`, `namedPaths` and
// `touchesStaged` itself, pinned with a controllable fake reader and no git at all. Split from
// run-mutations.staged.test.mjs at the test-file cap in .claude/limits.json, which keeps the
// end-to-end `--staged` cases — the ones that need a real repo and a real spawn — over there.

import assert from 'node:assert/strict'
import test from 'node:test'
import { localImports, namedPaths, relPath, touchesStaged } from './run-mutations.mjs'

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
// localImports and the one-hop scope reach
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
