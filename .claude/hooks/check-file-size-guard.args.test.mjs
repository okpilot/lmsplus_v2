// Argument-handling tests for the file-size guard: mode flags, path spellings, and the
// two exemptions that keep the unknown-path check from blocking legitimate commits
// (staged deletions, staged renames). Split out of the CLI suite when adding the rename
// case left that file three lines under the test-file cap this very guard enforces —
// code-style.md §1 requires the extraction in the SAME commit, and baselining our own
// test file would be the "widen the rule to fit my own code" move the programme exists
// to stop. Run:
//   node --test .claude/hooks/check-file-size-guard.args.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs and exactly one test goes red. The mutation each case pins is
// named in its title, because a test whose mechanism nothing exercises is a lie you will
// later trust.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('passing two mode flags together blocks instead of silently running one', () => {
  // MUTATION: remove the `new Set(flags).size > 1` guard → red. Both flags are KNOWN, so
  // neither the unknown-flag gate nor the flag-vs-path gate catches the pair; the first `if`
  // then wins and the other request is dropped with no diagnostic and exit 0. On the escape
  // valve that reads as "the baseline was rewritten" when nothing was written — the same
  // looks-like-it-worked shape as the `--stats` positional collision, one level up.
  const guard = join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs')
  for (const pair of [
    ['--update-baseline', '--stats'],
    ['--stats', '--update-baseline'],
  ]) {
    const r = spawnSync('node', [guard, ...pair], { encoding: 'utf8' })
    assert.equal(r.status, 1, `${pair.join(' ')} must block`)
    assert.match(r.stderr, /separate modes — run one/)
  }
  // each alone still works
  assert.equal(spawnSync('node', [guard, '--stats'], { encoding: 'utf8' }).status, 0)
})

test('a violation blocks however its path is spelled, and an unknown path is rejected', () => {
  // MUTATION: drop the normalisation and the unknown-argument check → red. `files.includes()` is
  // an exact string compare, so `./x.ts` and an absolute path matched nothing and the guard
  // returned 0 on a REAL violation. Today's only caller passes repo-root-relative paths, so this
  // held by luck of the caller — the same shape as the flag/path collision.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-norm-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true })
    mkdirSync(join(repo, 'src'), { recursive: true })
    copyFileSync(
      join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs'),
      join(repo, '.claude/hooks/check-file-size-guard.mjs'),
    )
    writeFileSync(
      join(repo, '.claude/limits.json'),
      JSON.stringify({
        rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'src/big.ts'), 'x\n'.repeat(150))
    execFileSync('git', ['add', '-A'], { cwd: repo })

    const run = (arg) =>
      spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', arg], {
        cwd: repo,
        encoding: 'utf8',
      })
    for (const spelling of ['src/big.ts', './src/big.ts', join(repo, 'src/big.ts')]) {
      const r = run(spelling)
      assert.equal(r.status, 1, `${spelling} must block`)
      // Assert the REASON, not just the exit code. Dropping normalisation still exits 1 — via
      // the unknown-path branch — so an outcome-only assertion passed with the mechanism gone.
      // A legitimate absolute-path caller must be told about the VIOLATION, not handed a
      // spurious "matches no tracked path".
      assert.match(
        r.stderr,
        /violation\(s\) of the limits/,
        `${spelling} must report the violation`,
      )
      assert.doesNotMatch(
        r.stderr,
        /match no tracked path/,
        `${spelling} must resolve, not be rejected`,
      )
    }
    const bogus = run('nope/missing.ts')
    assert.equal(bogus.status, 1, 'an argument matching no tracked path must fail closed')
    assert.match(bogus.stderr, /match no tracked path/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a staged deletion is not rejected as an unknown path', () => {
  // MUTATION: drop the `deleted` set from the unknown-path filter → red. lefthook passes staged
  // DELETIONS through {staged_files} while `git ls-files` omits them, so the unknown-path check
  // introduced one commit earlier blocked EVERY commit that removes a file. Caught by CR-local
  // round 4; the regression was live for one commit.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-del-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true })
    mkdirSync(join(repo, 'src'), { recursive: true })
    copyFileSync(
      join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs'),
      join(repo, '.claude/hooks/check-file-size-guard.mjs'),
    )
    writeFileSync(
      join(repo, '.claude/limits.json'),
      JSON.stringify({
        rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'src/gone.ts'), 'x\n'.repeat(10))
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed', '--no-verify'], { cwd: repo })
    execFileSync('git', ['rm', '-q', 'src/gone.ts'], { cwd: repo })

    const del = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', 'src/gone.ts'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(del.status, 0, 'a staged deletion must not block the commit')

    // a genuinely unknown path must still fail closed
    const bogus = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', 'src/never.ts'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(bogus.status, 1)
    assert.match(bogus.stderr, /match no tracked path/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a staged rename does not reject the SOURCE path as unknown', () => {
  // MUTATION: drop `--no-renames` from the staged-deletion git call → red. With rename
  // detection ON (git's default) a staged rename is classified `R`, so `--diff-filter=D`
  // returns nothing for it, while `git ls-files` carries only the DESTINATION. A caller
  // spelling the source path then hits the unknown-path check and blocks the commit.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-mv-'))
  try {
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo })
    mkdirSync(join(repo, '.claude', 'hooks'), { recursive: true })
    mkdirSync(join(repo, 'src'), { recursive: true })
    copyFileSync(
      join(process.cwd(), '.claude/hooks/check-file-size-guard.mjs'),
      join(repo, '.claude/hooks/check-file-size-guard.mjs'),
    )
    writeFileSync(
      join(repo, '.claude/limits.json'),
      JSON.stringify({
        rules: [{ kind: 'utility/helper', glob: '**/*.ts', max: 100 }],
        excludeBasenamePatterns: [],
        excludeGlobs: [],
        baseline: {},
      }),
    )
    writeFileSync(join(repo, 'src/old.ts'), 'x\n'.repeat(10))
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed', '--no-verify'], { cwd: repo })
    execFileSync('git', ['mv', 'src/old.ts', 'src/new.ts'], { cwd: repo })

    // git reports this as R100, so the source is absent from both `ls-files` and a
    // rename-detecting `--diff-filter=D`. Assert the classification the test rests on.
    const staged = execFileSync('git', ['diff', '--cached', '--name-status', '-M'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.match(staged, /^R/m, 'fixture must produce a RENAME, not an add+delete pair')

    const both = spawnSync(
      'node',
      ['.claude/hooks/check-file-size-guard.mjs', 'src/old.ts', 'src/new.ts'],
      { cwd: repo, encoding: 'utf8' },
    )
    assert.equal(both.status, 0, both.stderr)

    // and a genuinely unknown path must still fail closed
    const bogus = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', 'src/never.ts'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.equal(bogus.status, 1)
    assert.match(bogus.stderr, /match no tracked path/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
