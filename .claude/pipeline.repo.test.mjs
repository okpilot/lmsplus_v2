// Run: node --test .claude/pipeline.repo.test.mjs
//
// Spawns pipeline.test.mjs against a throwaway git worktree of HEAD. A synthetic fixture root
// cannot satisfy pipeline.test.mjs's `git ls-files`, `.claude/agents/*.md`, and model-literal-site
// checks without reproducing most of the repo, so this suite mutates a REAL COPY of HEAD instead.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertSingleOccurrence } from './hooks/run-mutations.mjs'
import { runNode } from './hooks/spawn.testkit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'pipeline.test.mjs')

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** A throwaway worktree of HEAD, removed however the body exits (git worktree remove --force). */
function withWorktree(fn) {
  const base = mkdtempSync(join(tmpdir(), 'pipeline-repo-'))
  const wt = join(base, 'wt')
  git(['worktree', 'add', '--detach', wt, 'HEAD'], HERE)
  try {
    return fn({ wt })
  } finally {
    try {
      git(['worktree', 'remove', '--force', wt], HERE)
    } catch {
      /* best effort; the temp dir removal below still cleans up the files */
    }
    rmSync(base, { recursive: true, force: true })
  }
}

function run(wt) {
  return runNode('pipeline', [SCRIPT, wt])
}

// CONTROL: green
// GROUP: pipeline-always-blocks
test('a pristine worktree of HEAD passes', () =>
  withWorktree(({ wt }) => {
    const { status } = run(wt)
    assert.equal(status, 0)
  }))

// CONTROL: red
// GROUP: pipeline-always-passes
test('renaming a lefthook pre-commit command the spec still declares blocks', () =>
  withWorktree(({ wt }) => {
    const path = join(wt, 'lefthook.yml')
    const text = readFileSync(path, 'utf8')
    const anchor = '    soft-delete-guard:\n'
    assertSingleOccurrence(text, anchor, 'pipeline-repo-rename-lefthook-command')
    writeFileSync(path, text.replace(anchor, '    soft-delete-guard-renamed:\n'))
    const { status, stderr } = run(wt)
    assert.equal(status, 1)
    assert.match(stderr, /soft-delete-guard/)
  }))
