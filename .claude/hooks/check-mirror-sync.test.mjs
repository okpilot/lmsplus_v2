// Unit test for the mirror-sync checker. Run:
//   node --test .claude/hooks/check-mirror-sync.test.mjs
// Each case below pins one fail-open that the previous, prose-embedded bash version of
// this check actually shipped with — found across five review rounds by four different
// reviewers. Delete the corresponding guard in check-mirror-sync.mjs and exactly one of
// these goes red.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkMirrors, clauseBlock, digest } from './check-mirror-sync.mjs'

const ANCHOR = 'ANCHOR_TEXT begins the clause'
const para = (second) => `intro\n\n${ANCHOR} here\n${second}\nthird line\n\ntail\n`

/** Runs fn against a fresh throwaway git repo, always cleaned up. */
function withRepo(fn) {
  const repo = mkdtempSync(join(tmpdir(), 'mirror-sync-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    fn(repo, () => {
      execFileSync('git', ['add', '-A'], { cwd: repo })
      execFileSync('git', ['commit', '-qm', 't'], { cwd: repo })
    })
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

test('reports in sync when every copy of the clause is identical', () => {
  withRepo((repo, commit) => {
    writeFileSync(join(repo, 'a.md'), para('second line'))
    writeFileSync(join(repo, 'b.md'), para('second line'))
    commit()
    const { ok, rows } = checkMirrors(ANCHOR, repo)
    assert.equal(ok, true)
    assert.equal(rows.length, 2)
    assert.equal(new Set(rows.map((r) => r.digest)).size, 1)
  })
})

test('reports divergence when a copy differs on a line below the anchor', () => {
  // The bash version hashed only the anchor LINE, so this diverged pair passed silently.
  withRepo((repo, commit) => {
    writeFileSync(join(repo, 'a.md'), para('second line'))
    writeFileSync(join(repo, 'b.md'), para('second line CHANGED'))
    commit()
    const { ok, rows } = checkMirrors(ANCHOR, repo)
    assert.equal(ok, false)
    assert.equal(new Set(rows.map((r) => r.digest)).size, 2)
  })
})

test('hashes a file whose path contains a space instead of dropping it', () => {
  // `for f in $(git grep -l ...)` word-split such a path and never opened the real file.
  withRepo((repo, commit) => {
    mkdirSync(join(repo, 'sub dir'))
    writeFileSync(join(repo, 'sub dir', 'file with space.md'), para('second line'))
    writeFileSync(join(repo, 'plain.md'), para('second line'))
    commit()
    const { ok, rows } = checkMirrors(ANCHOR, repo)
    assert.equal(ok, true)
    assert.ok(rows.map((r) => r.file).includes('sub dir/file with space.md'))
    assert.ok(rows.every((r) => r.digest))
  })
})

test('matches an anchor containing a backslash escape literally', () => {
  // `awk -v c=...` applied C-style escape processing, so such an anchor matched nothing.
  withRepo((repo, commit) => {
    const esc = 'literal \\n marker'
    writeFileSync(join(repo, 'a.md'), `intro\n\n${esc} here\nsecond\n\ntail\n`)
    writeFileSync(join(repo, 'b.md'), `intro\n\n${esc} here\nsecond\n\ntail\n`)
    commit()
    const { ok, rows } = checkMirrors(esc, repo)
    assert.equal(rows.length, 2)
    assert.equal(ok, true)
  })
})

test('fails rather than comparing the first of several anchors in one file', () => {
  withRepo((repo, commit) => {
    writeFileSync(join(repo, 'a.md'), `${para('second line')}\n${ANCHOR} here\nDIFFERENT\n\n`)
    writeFileSync(join(repo, 'b.md'), para('second line'))
    commit()
    const { ok, rows } = checkMirrors(ANCHOR, repo)
    assert.equal(ok, false)
    assert.match(rows.find((r) => r.file === 'a.md').error, /appears 2x/)
  })
})

test('fails when no tracked file carries the anchor, instead of reporting nothing to do', () => {
  withRepo((repo, commit) => {
    writeFileSync(join(repo, 'a.md'), 'nothing relevant here\n')
    commit()
    const { ok, rows } = checkMirrors('NO SUCH ANCHOR', repo)
    assert.equal(rows.length, 0)
    assert.equal(ok, false)
  })
})

test('stops at the blank line and does not absorb the next paragraph', () => {
  const block = clauseBlock(para('second line'), ANCHOR)
  assert.ok(block.includes('third line'))
  assert.ok(!block.includes('tail'))
})

test('extracts to end of file when the clause is last and unterminated', () => {
  assert.ok(clauseBlock(`intro\n\n${ANCHOR} here\nlast line`, ANCHOR).includes('last line'))
})

test('produces a different digest when any line of the block changes', () => {
  assert.notEqual(digest(clauseBlock(para('x'), ANCHOR)), digest(clauseBlock(para('y'), ANCHOR)))
})
