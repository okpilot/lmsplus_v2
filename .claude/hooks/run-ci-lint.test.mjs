// Tests for .claude/hooks/run-ci-lint.mjs (#1296): /fullpush lint = CI `lint` job.
// Assumed CLI (plan leaves it open): `run-ci-lint.mjs [--workflow <file>] [--job <id>] [--list]`.
// `--list` parses and prints the commands to run (after substitution), one per line, without running.
// Fixture workflows only; the live ci.yml is parse-only (`--list`). `lint:ci` is never invoked here.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(ROOT, '.claude/hooks/run-ci-lint.mjs')
const dir = mkdtempSync(join(tmpdir(), 'run-ci-lint-'))
let n = 0
after(() => rmSync(dir, { recursive: true, force: true }))

function run(yaml, extra = []) {
  const wf = join(dir, `wf${n++}.yml`)
  writeFileSync(wf, yaml)
  return runNode('run-ci-lint', [SCRIPT, '--workflow', wf, ...extra], { cwd: dir })
}
const wrap = (steps) =>
  `name: t\non: pull_request\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`

test('single-line run steps execute and print PASS per step name', () => {
  const r = run(wrap('      - name: Say hi\n        run: echo HELLO_ONE\n'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /HELLO_ONE/)
  assert.match(r.stdout, /PASS.*Say hi/)
})

// GROUP: ci-run-steps-list-item
test('a compact `- run:` list-item step executes', () => {
  const r = run(wrap('      - run: echo LIST_ITEM\n'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /LIST_ITEM/)
})

test('block scalar (|) run steps execute every line', () => {
  const r = run(
    wrap('      - name: Multi\n        run: |\n          echo LINE_A\n          echo LINE_B\n'),
  )
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /LINE_A/)
  assert.match(r.stdout, /LINE_B/)
  assert.match(r.stdout, /PASS.*Multi/)
})

test('folded block scalar (>-) run step executes as one command', () => {
  const r = run(
    wrap('      - name: Folded\n        run: >-\n          echo FOLD_A\n          FOLD_B\n'),
  )
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /FOLD_A FOLD_B/)
})

test('a failing step does not stop later steps, prints FAIL, and exits non-zero', () => {
  const r = run(
    wrap(
      '      - name: Bad\n        run: exit 1\n      - name: Good\n        run: echo SECOND_RAN\n',
    ),
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /FAIL.*Bad/)
  assert.match(r.stdout, /SECOND_RAN/)
  assert.match(r.stdout, /PASS.*Good/)
})

test('every step runs with TURBO_FORCE=true', () => {
  const r = run(wrap('      - name: Env\n        run: echo TF=$TURBO_FORCE\n'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /TF=true/)
})

test('github.event.pull_request.base.sha is substituted with origin/master', () => {
  const r = run(
    wrap(
      "      - name: Base\n        if: github.event_name == 'pull_request'\n        run: echo BASE=${{ github.event.pull_request.base.sha }}\n",
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /BASE=origin\/master/)
})

test('an unknown ${{ }} expression in run aborts non-zero and names the expression', () => {
  const r = run(wrap('      - name: Secret\n        run: echo ${{ secrets.TOKEN }}\n'))
  assert.notEqual(r.status, 0)
  assert.match(r.stdout + r.stderr, /secrets\.TOKEN/)
})

test('a step env: containing ${{ }} aborts non-zero', () => {
  const r = run(
    wrap(
      '      - name: E\n        env:\n          X: ${{ env.FOO }}\n        run: echo ENV_STEP_RAN\n',
    ),
  )
  assert.notEqual(r.status, 0)
  assert.doesNotMatch(r.stdout, /ENV_STEP_RAN/)
  assert.match(r.stdout + r.stderr, /env\.FOO/)
})

test('only the lint job runs', () => {
  const yaml = `${wrap('      - name: L\n        run: echo IN_LINT\n')}  other:\n    runs-on: ubuntu-latest\n    steps:\n      - name: O\n        run: echo IN_OTHER\n`
  const r = run(yaml)
  assert.match(r.stdout, /IN_LINT/)
  assert.doesNotMatch(r.stdout, /IN_OTHER/)
})

// GROUP: ci-run-steps-list-item
test('live ci.yml lint job parses to include the decisions-ledger guard with base origin/master', () => {
  const r = runNode('run-ci-lint --list', [SCRIPT, '--list'], { cwd: ROOT })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /check-decisions-ledger\.mjs --base origin\/master/)
  assert.match(r.stdout, /^pnpm install --frozen-lockfile$/m)
})

test('package.json lint:ci script runs run-ci-lint.mjs', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts?.['lint:ci']
  assert.equal(s, 'node .claude/hooks/run-ci-lint.mjs')
})

test('ci.yml lint job runs this suite and the coderabbit-mirror suite', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  assert.match(ci, /node --test \.claude\/hooks\/run-ci-lint\.test\.mjs/)
  assert.match(ci, /node --test \.claude\/hooks\/coderabbit-mirror\.test\.mjs/)
})

test('the shared run-step parser lives in ci-run-steps.mjs and controls.test.mjs imports it', () => {
  const c = readFileSync(join(ROOT, '.claude/controls.test.mjs'), 'utf8')
  assert.match(c, /ci-run-steps\.mjs/)
  assert.doesNotMatch(c, /function collectRunSteps/)
})

const withJob = (extra, steps) =>
  `name: t\non: pull_request\n${extra.workflow ?? ''}jobs:\n  lint:\n    runs-on: ubuntu-latest\n${extra.job ?? ''}    steps:\n${steps}`

test('step, job and workflow env scalars are exported; step overrides job overrides workflow', () => {
  const r = run(
    withJob(
      { workflow: 'env:\n  W: wf\n  O: wf\n', job: '    env:\n      J: job\n      O: job\n' },
      '      - name: E\n        env:\n          S: "st"\n          O: step\n        run: echo "V=$W,$J,$S,$O"\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /V=wf,job,st,step/)
})

test('a column-0 comment inside a step env block keeps the vars after it', () => {
  const r = run(
    wrap(
      '      - name: C\n        env:\n          A: one\n# note\n          B: two\n        run: echo "V=$A,$B"\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /V=one,two/)
})

test('a column-0 comment inside a workflow env block keeps the vars after it', () => {
  const r = run(
    withJob(
      { workflow: 'env:\n  A: one\n# note\n  B: two\n' },
      '      - name: C\n        run: echo "V=$A,$B"\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /V=one,two/)
})

test('a non-scalar env block aborts before any step runs', () => {
  for (const env of ['        env: {A: b}\n', '        env:\n          A: |\n            x\n']) {
    const r = run(wrap(`      - name: N\n${env}        run: echo NONSCALAR_RAN\n`))
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /NONSCALAR_RAN/)
    assert.match(r.stderr, /ABORT/)
  }
})

test('a ${{ }} value in job or workflow env aborts', () => {
  for (const extra of [
    { workflow: 'env:\n  A: ${{ vars.X }}\n' },
    { job: '    env:\n      A: ${{ vars.X }}\n' },
  ]) {
    const r = run(withJob(extra, '      - run: echo EXPR_RAN\n'))
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /EXPR_RAN/)
    assert.match(r.stderr, /vars\.X/)
  }
})

test('working-directory, shell and defaults abort before any step runs', () => {
  const cases = [
    wrap('      - name: W\n        working-directory: apps\n        run: echo UNSUP_RAN\n'),
    wrap('      - name: S\n        shell: sh\n        run: echo UNSUP_RAN\n'),
    withJob(
      { job: '    defaults:\n      run:\n        shell: sh\n' },
      '      - run: echo UNSUP_RAN\n',
    ),
    withJob({ workflow: 'defaults:\n  run:\n    shell: sh\n' }, '      - run: echo UNSUP_RAN\n'),
  ]
  for (const yaml of cases) {
    const r = run(yaml)
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /UNSUP_RAN/)
    assert.match(r.stderr, /ABORT/)
  }
})

test('a failing stage of a pipe fails the step (pipefail)', () => {
  const r = run(wrap('      - name: Pipe\n        run: false | true\n'))
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /FAIL.*Pipe/)
})

test('a column-0 # comment inside the job does not drop later steps', () => {
  const r = run(
    wrap(
      '      - name: A\n        run: echo STEP_A\n# note\n      - name: B\n        run: echo STEP_B\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /STEP_B/)
})

test('a folded > body with a blank line aborts', () => {
  const r = run(
    wrap('      - name: F\n        run: >\n          echo FOLD_A\n\n          echo FOLD_B\n'),
  )
  assert.notEqual(r.status, 0)
  assert.doesNotMatch(r.stdout, /FOLD_A/)
  assert.match(r.stderr, /ABORT/)
})

// GROUP: ci-run-steps-list-item
test('a trailing YAML comment on a frozen pnpm install is stripped from the listed command', () => {
  const r = run(wrap('      - run: pnpm install --frozen-lockfile # deps\n'), ['--list'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^pnpm install --frozen-lockfile$/m)
  assert.doesNotMatch(r.stdout, /#/)
})

test('continue-on-error aborts before any step runs', () => {
  for (const yaml of [
    wrap('      - name: C\n        continue-on-error: true\n        run: echo COE_RAN\n'),
    withJob({ job: '    continue-on-error: true\n' }, '      - run: echo COE_RAN\n'),
  ]) {
    const r = run(yaml)
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /COE_RAN/)
    assert.match(r.stderr, /ABORT.*continue-on-error/)
  }
})

test('a quoted env value containing a backslash or a doubled quote aborts', () => {
  for (const v of ['"a\\nb"', "'it''s'"]) {
    const r = run(
      wrap(`      - name: Q\n        env:\n          X: ${v}\n        run: echo QUOTED_RAN\n`),
    )
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /QUOTED_RAN/)
    assert.match(r.stderr, /ABORT.*X/)
  }
})

test('a quoted run containing its quote type YAML escape aborts', () => {
  for (const v of ['"echo \\"hi\\""', "'it''s'"]) {
    const r = run(wrap(`      - name: Q\n        run: ${v}\n`))
    assert.notEqual(r.status, 0)
    assert.match(r.stdout + r.stderr, /quoted run with a YAML escape/)
  }
})

test('a quoted run without its escape is listed as written', () => {
  for (const [v, want] of [
    ["'grep \\d'", 'grep \\d'],
    ['"echo hi"', 'echo hi'],
  ]) {
    const r = run(wrap(`      - name: Q\n        run: ${v}\n`), ['--list'])
    assert.equal(r.status, 0, r.stderr)
    assert.ok(r.stdout.split('\n').includes(want), r.stdout)
  }
})

test('a trailing comment on a step name is not part of the name', () => {
  const a = run(wrap('      - name: "Lint" # why\n        run: echo X\n'))
  assert.match(a.stdout, /PASS.*Lint$/m)
  assert.doesNotMatch(a.stdout, /# why/)
  const b = run(wrap('      - name: "Lint #1" # why\n        run: echo X\n'))
  assert.match(b.stdout, /PASS.*Lint #1$/m)
})

test('a frozen pnpm install step is listed exactly as written with no flag appended', () => {
  const r = run(wrap('      - name: Install\n        run: pnpm install --frozen-lockfile\n'), [
    '--list',
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const lines = r.stdout.split('\n').filter((l) => l.includes('pnpm install'))
  assert.ok(lines.length > 0, r.stdout)
  assert.ok(
    lines.every((l) => !l.includes('--lockfile-only')),
    r.stdout,
  )
  assert.ok(
    lines.some((l) => l.trimEnd().endsWith('pnpm install --frozen-lockfile')),
    r.stdout,
  )
})

test('a CRLF workflow lists its commands with no carriage return', () => {
  const yaml = wrap('      - name: Say\n        run: echo CRLF_CMD\n').replace(/\n/g, '\r\n')
  const r = run(yaml, ['--list'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /echo CRLF_CMD/)
  assert.ok(!r.stdout.includes('\r'), JSON.stringify(r.stdout))
})

test('job-level env and timeout-minutes after steps do not alter the last step', () => {
  const r = run(
    wrap('      - name: Last\n        run: echo LAST_CMD\n') +
      '    env:\n      run: x\n    timeout-minutes: 5\n',
    ['--list'],
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /echo LAST_CMD/)
  assert.ok(!/echo LAST_CMD[^\n]*(run: x|timeout)/.test(r.stdout), r.stdout)
})

test('CI defaults to true and a step env CI overrides it', () => {
  const r = run(
    wrap(
      '      - name: Def\n        run: echo "CI=$CI"\n' +
        '      - name: Ovr\n        env:\n          CI: x\n        run: echo "CI=$CI"\n',
    ),
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const vals = r.stdout.split('\n').filter((l) => /^CI=/.test(l))
  assert.deepEqual(vals, ['CI=true', 'CI=x'])
})
