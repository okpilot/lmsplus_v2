#!/usr/bin/env node

// Runs the `run:` steps of the CI `lint` job locally (#1296), so /fullpush runs what CI runs; `uses:` steps are skipped,
// so the local Node/pnpm versions are not compared with CI's.
// Only the named job's steps run; other jobs (mutation-plan, mutation-harness, lint-gate) do not.
//
// Usage:  node .claude/hooks/run-ci-lint.mjs [--workflow <file>] [--job <id>] [--list]
//         (defaults: .github/workflows/ci.yml, job `lint`)
// Exit:   0 = every step passed (or --list)
//         1 = a step failed, or a step uses a `${{ }}` expression this script cannot substitute
//         2 = usage error or unreadable workflow
//
// Every step runs to completion with CI=true and TURBO_FORCE=true under `bash --noprofile --norc -eo pipefail`;
// `pnpm install` steps run as written. Scalar `env:` entries (workflow, job, step) are exported; a quoted
// value containing `\` or `''` aborts. `timeout-minutes` is not enforced locally (CI enforces it).
// `continue-on-error` aborts.
// `if:` is not evaluated — every step runs; the PR base becomes `origin/master` (run `git fetch origin` first).
// `${{ github.event.pull_request.base.sha }}` is the only substituted expression; any other `${{ }}`
// in a step's `run:` or an `env:`, a non-scalar `env:`, `defaults:`, `working-directory` or `shell`
// aborts before anything runs.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobScope, jobSteps, parseEnv } from './ci-run-steps.mjs'

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
let scope
try {
  const text = readFileSync(workflow, 'utf8')
  steps = jobSteps(text, job)
  scope = jobScope(text, job)
} catch (err) {
  usage(`${workflow}: ${err.message}`)
}

const plan = []
const problems = scope.unsupported.map((u) => `${u} is not supported`)
const scopeEnv = {}
for (const { where, text } of scope.env) {
  const { vars, problems: ps } = parseEnv(text)
  Object.assign(scopeEnv, vars)
  for (const p of ps) problems.push(`${where} ${p}`)
}
for (const s of steps) {
  if (s.run === null) continue
  const name = s.name ?? s.run.split('\n')[0].trim()
  const cmd = s.run.replace(BASE_EXPR, 'origin/master')
  for (const k of s.unsupported) problems.push(`step "${name}": ${k} is not supported`)
  const { vars, problems: ps } = parseEnv(s.env)
  for (const p of ps) problems.push(`step "${name}": ${p}`)
  for (const e of cmd.match(ANY_EXPR) ?? [])
    problems.push(`step "${name}": unsupported expression ${e}`)
  plan.push({ name, cmd, env: vars })
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
for (const { name, cmd, env } of plan) {
  console.log(`\n=== ${name}`)
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', cmd], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true', ...scopeEnv, ...env, TURBO_FORCE: 'true' },
  })
  if (r.error) console.log(`FAIL ${name} (could not start: ${r.error.code})`)
  const ok = r.status === 0
  if (!r.error) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed.push(name)
}
if (failed.length > 0) {
  console.log(`\n${failed.length} of ${plan.length} step(s) failed:\n  ${failed.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nall ${plan.length} step(s) passed`)
