// Argument-handling tests for the file-size guard: mode flags, path spellings, and the
// two exemptions that keep the unknown-path check from blocking legitimate commits
// (staged deletions, staged renames). Split out of the CLI suite when adding the rename
// case pushed that file into §1's same-commit extraction trigger — the exact line count is
// deliberately not stated, because it describes an intermediate authoring state nobody can
// reproduce, and two reviewers reconstructed it differently. Baselining our own
// test file would be the "widen the rule to fit my own code" move the programme exists
// to stop. Run:
//   node --test .claude/hooks/check-file-size-guard.args.test.mjs
//
// Every case below is MUTATION-PINNED: break the named mechanism in
// check-file-size-guard.mjs and the case (or the named GROUP of cases sharing that
// mechanism) goes red — the two rename cases deliberately share `--no-renames`, so breaking
// it reddens both. Do not restore the stricter "exactly one" wording here without re-running
// the mutations; it was false of this file the moment the second rename case landed. The
// mutation each case pins is named in its title, because a test whose mechanism nothing
// exercises is a lie you will later trust.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
  // realpathSync is load-bearing, not tidiness: on macOS `os.tmpdir()` is /var/..., a symlink
  // to /private/var. The child reports the RESOLVED cwd, so the absolute spelling below would
  // relativise to a `..`-prefixed path matching no tracked file — the guard would block for the
  // WRONG reason and the doesNotMatch assertion would fail. Same platform-divergence class as
  // the CLI suite's PATH_MAX fixture.
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'file-size-norm-')))
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

test('a rename into a violation still blocks — the exemption clears the unknown-path check, not the violation check', () => {
  // MUTATION: drop `--no-renames` (same mechanism as the sibling test above) → red. Without
  // it the SOURCE path is rejected as unknown BEFORE the violation is ever reported, so the
  // failure reason flips from "violation(s) of the limits" to "match no tracked path" — the
  // commit still exits 1, but for the wrong reason, and a caller branching on the message
  // (or a future test asserting only the exit code) would not notice. This also confirms the
  // exemption is scoped to the unknown-path gate alone: it must not double as a reason to
  // skip evaluating the renamed file, which would silently launder a real regression through
  // a rename.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-mv-violation-'))
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
    // Already over cap BEFORE the rename, and never baselined — a "new violation" the
    // rename must not launder away.
    writeFileSync(join(repo, 'src/old.ts'), 'x\n'.repeat(150))
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed', '--no-verify'], { cwd: repo })
    execFileSync('git', ['mv', 'src/old.ts', 'src/new.ts'], { cwd: repo })

    const staged = execFileSync('git', ['diff', '--cached', '--name-status', '-M'], {
      cwd: repo,
      encoding: 'utf8',
    })
    assert.match(staged, /^R/m, 'fixture must produce a RENAME, not an add+delete pair')

    const run = (args) =>
      spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs', ...args], {
        cwd: repo,
        encoding: 'utf8',
      })

    // Both spellings, and the destination alone — how lefthook's `{staged_files}` actually
    // spells a rename (`git diff --diff-filter=ACMR --name-only` reports only the new path,
    // confirmed empirically: a rename never surfaces the source through today's caller) —
    // must each report the violation, not wave it through.
    for (const args of [['src/old.ts', 'src/new.ts'], ['src/new.ts']]) {
      const r = run(args)
      const label = args.join(' ')
      assert.equal(r.status, 1, `${label} must block`)
      assert.match(r.stderr, /violation\(s\) of the limits/, `${label} must report the violation`)
      assert.doesNotMatch(
        r.stderr,
        /match no tracked path/,
        `${label} must not be rejected as unknown`,
      )
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('a git failure listing staged deletions blocks instead of failing open', () => {
  // Resolve the real binary rather than hardcoding /usr/bin/git — a wrapper that delegates to a
  // fixed path works only where git happens to be installed there (not Homebrew, not Nix).
  const REAL_GIT = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  // MUTATION: change the catch's `return 1` to a fail-open (e.g. `deleted = new Set()`
  // and fall through) → red. The comment right above this catch calls out exactly this
  // risk — "a failed git call ABORTS rather than silently yielding an empty set" — but
  // nothing exercised it: every other case in this file makes the underlying git command
  // SUCCEED. A PATH-shadowed `git` makes `diff --cached` fail while `ls-files` (a
  // different subcommand, needed earlier in main()) still passes through to the real
  // binary — isolating the one call this test targets.
  const repo = mkdtempSync(join(tmpdir(), 'file-size-deldiff-'))
  const fakeBin = mkdtempSync(join(tmpdir(), 'file-size-fakegit-'))
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
    writeFileSync(join(repo, 'src/a.ts'), 'x\n')
    execFileSync('git', ['add', '-A'], { cwd: repo })
    execFileSync('git', ['commit', '-qm', 'seed', '--no-verify'], { cwd: repo })

    // A `git` on PATH that fails ONLY `diff --cached ...` and otherwise delegates —
    // ls-files (called earlier in main()) must still succeed for real.
    writeFileSync(
      join(fakeBin, 'git'),
      '#!/bin/sh\n' +
        'if [ "$1" = "diff" ] && [ "$2" = "--cached" ]; then\n' +
        '  echo "fake git diff failure" >&2\n' +
        '  exit 1\n' +
        'fi\n' +
        `exec ${REAL_GIT} "$@"\n`,
    )
    execFileSync('chmod', ['+x', join(fakeBin, 'git')])

    const r = spawnSync('node', ['.claude/hooks/check-file-size-guard.mjs'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
    })
    assert.equal(r.status, 1, 'a git failure here must BLOCK, not pass clean')
    assert.match(r.stderr, /cannot list staged deletions — BLOCKING/)
  } finally {
    rmSync(repo, { recursive: true, force: true })
    rmSync(fakeBin, { recursive: true, force: true })
  }
})
