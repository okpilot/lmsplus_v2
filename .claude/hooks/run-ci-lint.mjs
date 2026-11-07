#!/usr/bin/env node

// Runs the `run:` steps of the CI `lint` job locally (#1296), so /fullpush grades what CI grades.
// Only the named job's steps run; other jobs (mutation-plan, mutation-harness, lint-gate) do not.
//
// Usage:  node .claude/hooks/run-ci-lint.mjs [--workflow <file>] [--job <id>] [--list]
//         (defaults: .github/workflows/ci.yml, job `lint`)
// Exit:   0 = every step passed (or --list)
//         1 = a step failed, or a step uses a `${{ }}` expression this script cannot substitute
//         2 = usage error or unreadable workflow
//
// Every step runs to completion with TURBO_FORCE=true; `pnpm install` steps are skipped.
// `${{ github.event.pull_request.base.sha }}` becomes `origin/master`; any other `${{ }}` in a
// step's `run:` or `env:` aborts before anything runs.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobSteps } from './ci-run-steps.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE_EXPR = /\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/g
const ANY_EXPR = /\$\{\{.*?\}\}/g

function usage(msg) {
  console.error(`run-ci-lint: ${msg}`)
  console.error('usage: run-ci-lint.mjs [--workflow <file>] [--job <id>] [--list]')
  process.exit(2)
}

let workflow = join(ROOT, '.github/workflows/ci.yml')
let job = 'lint'
let list = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--workflow' && argv[i + 1]) workflow = resolve(argv[++i])
  else if (argv[i] === '--job' && argv[i + 1]) job = argv[++i]
  else if (argv[i] === '--list') list = true
  else usage(`unknown argument ${argv[i]}`)
}

let steps
try {
  steps = jobSteps(readFileSync(workflow, 'utf8'), job)
} catch (err) {
  usage(`${workflow}: ${err.message}`)
}

const plan = []
const problems = []
for (const s of steps) {
  if (s.run === null || /^pnpm install\b/.test(s.run.trim())) continue
  const name = s.name ?? s.run.split('\n')[0].trim()
  for (const e of s.env.match(ANY_EXPR) ?? []) problems.push(`step "${name}": env contains ${e}`)
  const cmd = s.run.replace(BASE_EXPR, 'origin/master')
  for (const e of cmd.match(ANY_EXPR) ?? [])
    problems.push(`step "${name}": unsupported expression ${e}`)
  plan.push({ name, cmd })
}
if (problems.length > 0) {
  for (const p of problems) console.error(`ABORT ${p}`)
  process.exit(1)
}

if (list) {
  for (const p of plan) console.log(p.cmd)
  process.exit(0)
}

const failed = []
for (const { name, cmd } of plan) {
  console.log(`\n=== ${name}`)
  const r = spawnSync('bash', ['-e', '-c', cmd], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, TURBO_FORCE: 'true' },
  })
  const ok = r.status === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed.push(name)
}
if (failed.length > 0) {
  console.log(`\n${failed.length} of ${plan.length} step(s) failed:\n  ${failed.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nall ${plan.length} step(s) passed`)
