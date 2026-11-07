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
// Every step runs to completion with TURBO_FORCE=true under `bash --noprofile --norc -eo pipefail`;
// a single-line `pnpm install --frozen-lockfile` step runs with `--lockfile-only` appended (lockfile
// check, node_modules untouched); any other `pnpm install` step aborts. Scalar `env:` entries
// (workflow, job, step) are exported; a quoted value containing `\` or `''` aborts.
// `timeout-minutes` (the step's, else the job's) is enforced by GNU `timeout -k 5` over the process
// group (a timeout is a FAIL). `continue-on-error` aborts.
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

/** True when any command-position segment of a run text is `pnpm [flags] install|i`. */
function runsPnpmInstall(run) {
  return run.split(/[;&|\n]/).some((seg) => {
    const c = seg
      .trim()
      .replace(/^(\w+=\S*\s+)+/, '')
      .replace(/^corepack\s+/, '')
    return /^pnpm(\s+--?\w[\w-]*(=\S+)?(\s+[^-\s]\S*)??)*\s+(install|i)(\s|$)/.test(c)
  })
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
  let cmd = s.run.replace(BASE_EXPR, 'origin/master')
  if (runsPnpmInstall(s.run)) {
    const t = s.run.trim()
    if (!/^pnpm install(\s|$)/.test(t) || /[;&|\n`]|\$\(/.test(t))
      problems.push(`step "${name}": pnpm install must be a single-line \`pnpm install …\` step`)
    else if (/\s--frozen-lockfile(\s|$)/.test(t)) cmd += ' --lockfile-only'
    else problems.push(`step "${name}": pnpm install without --frozen-lockfile is not supported`)
  }
  for (const k of s.unsupported) problems.push(`step "${name}": ${k} is not supported`)
  const { vars, problems: ps } = parseEnv(s.env)
  for (const p of ps) problems.push(`step "${name}": ${p}`)
  let timeoutSecs = null
  const minutes = s.timeoutMinutes ?? scope.timeoutMinutes
  if (minutes !== null) {
    if (/^\d+(\.\d+)?$/.test(minutes)) timeoutSecs = Number(minutes) * 60
    else problems.push(`step "${name}": unsupported timeout-minutes ${minutes}`)
  }
  for (const e of cmd.match(ANY_EXPR) ?? [])
    problems.push(`step "${name}": unsupported expression ${e}`)
  plan.push({ name, cmd, env: vars, timeoutSecs })
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
for (const { name, cmd, env, timeoutSecs } of plan) {
  console.log(`\n=== ${name}`)
  const shell = ['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', cmd]
  const argv = timeoutSecs === null ? shell : ['timeout', '-k', '5', `${timeoutSecs}s`, ...shell]
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...scopeEnv, ...env, TURBO_FORCE: 'true' },
  })
  if (r.error) console.log(`FAIL ${name} (could not start: ${r.error.code})`)
  else if (timeoutSecs !== null && (r.status === 124 || r.status === 137))
    console.log(`timeout-minutes exceeded (or exit 124/137): ${name}`)
  const ok = r.status === 0
  if (!r.error) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed.push(name)
}
if (failed.length > 0) {
  console.log(`\n${failed.length} of ${plan.length} step(s) failed:\n  ${failed.join('\n  ')}`)
  process.exit(1)
}
console.log(`\nall ${plan.length} step(s) passed`)
