// Spawned controls for the design-token class-scan guard (#1677 PR B). Run:
//   node --test .claude/hooks/check-design-tokens.test.mjs
// Fixtures live under a throwaway `apps/web/<dir>/` tree so the guard's path scope applies.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runNode } from './spawn.testkit.mjs'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'check-design-tokens.mjs')

/** A crash (missing module, syntax error) exits 1 too; it is not a verdict. */
function ran(r) {
  assert.ok(!/ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/.test(r.stderr), r.stderr)
  return r
}

/** Spawn the real guard (staged-mode argv) on one fixture at `apps/web/<rel>`. */
function runGuardOn(source, rel = 'components/fixture.tsx') {
  const dir = mkdtempSync(join(tmpdir(), 'design-tokens-guard-'))
  try {
    const file = join(dir, 'apps/web', rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source, 'utf8')
    return ran(runNode('check-design-tokens.mjs', [HOOK, file], { timeout: 20_000 }))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const cls = (c) => `export const X = () => <div className="flex ${c}" />\n`
const named = (r, rule) => new RegExp(`\\b${rule}\\b`).test(r.stdout + r.stderr)

// CONTROL: red
// GROUP: check-design-tokens-always-passes
test('control: a staged file with an off-scale spacing step blocks with exit 1', () => {
  const r = runGuardOn(cls('p-7'))
  assert.equal(r.status, 1)
  assert.ok(named(r, 'R1'))
})

// CONTROL: green
// GROUP: check-design-tokens-always-blocks
test('control: a staged file with token-backed classes passes with exit 0', () => {
  const r = runGuardOn(cls('p-nav-gap gap-2 px-gutter bg-primary font-semibold sm:flex'))
  assert.equal(r.status, 0)
})

const RED = [
  ['R1', 'p-7'],
  ['R1', 'gap-9'],
  ['R1', 'md:w-72'],
  ['R2', 'gap-row'],
  ['R2', 'px-inline'],
  ['R3', 'z-10'],
  ['R3', '-z-10'],
  ['R4', 'border-2'],
  ['R4', 'ring-1'],
  ['R4', 'outline-2'],
  ['R4', 'divide-x-2'],
  ['R4', 'ring-offset-2'],
  ['R4', 'ring-inset'],
  ['R5', 'opacity-40'],
  ['R6', 'bg-primary/50'],
  ['R7', 'min-[500px]:flex'],
  ['R7', 'max-[600px]:flex'],
  ['R8', 'font-bold'],
  ['R8', 'tracking-wide'],
  ['R8', 'md:flex'],
  ['R8', 'shadow-lg'],
  ['R8', 'bg-red-500'],
  ['R9', 'rounded-lg'],
  ['R9', 'max-w-2xl'],
  ['R9', 'size-[18px]'],
  ['R9', 'text-sm'],
  ['R9', 'size-3.5!'],
]
for (const [rule, c] of RED) {
  test(`${rule}: "${c}" blocks with exit 1 naming ${rule}`, () => {
    const r = runGuardOn(cls(c))
    assert.equal(r.status, 1)
    assert.ok(named(r, rule), r.stdout + r.stderr)
  })
}

for (const c of ['mt-[3px]', 'z-10 ', 'opacity-40']) {
  test(`B3: made-up value "${c.trim()}" blocks`, () => {
    assert.equal(runGuardOn(cls(c)).status, 1)
  })
}

test('R8: a template literal class is scanned', () => {
  assert.equal(runGuardOn('const c = `flex\n  font-bold`\n').status, 1)
})

test('R8: CRLF source is scanned', () => {
  assert.equal(runGuardOn('const c = "flex\\n font-bold"\r\nconst d = "p-7"\r\n').status, 1)
})

test('R10: native title= blocks naming R10', () => {
  const r = runGuardOn('export const X = () => <button title="Close" />\n')
  assert.equal(r.status, 1)
  assert.ok(named(r, 'R10'))
})

test('R11: numeric strokeWidth blocks naming R11', () => {
  const r = runGuardOn('export const X = () => <path strokeWidth={2} />\n')
  assert.equal(r.status, 1)
  assert.ok(named(r, 'R11'))
})

test('R11: numeric strokeWidth passes under components/diagrams', () => {
  const src = 'export const X = () => <path strokeWidth={2} />\n'
  assert.equal(runGuardOn(src, 'components/diagrams/x.tsx').status, 0)
})

test('R12: hex colour in lib/email blocks naming R12', () => {
  const r = runGuardOn('export const c = "#ff0000"\n', 'lib/email/x.ts')
  assert.equal(r.status, 1)
  assert.ok(named(r, 'R12'))
})

test('R12: hex colour outside lib/email passes', () => {
  assert.equal(runGuardOn('export const c = "#ff0000"\n', 'lib/x.ts').status, 0)
})

const GREEN = [
  'p-0 p-px p-0.5 p-1.5 p-10 w-1/2 w-full w-auto h-screen -mt-2',
  'p-nav-gap rounded-control max-w-content size-icon',
  'font-semibold tracking-code text-body',
  'bg-primary bg-white bg-transparent text-current',
  'sm:flex lg:flex max-tiny:flex',
  'opacity-0 opacity-100 opacity-disabled',
  'border border-input ring ring-ring outline-none',
  'data-[size=sm]:p-2 has-[>svg]:gap-2 lg:grid-cols-(--layout-setup)',
  'shadow-raised',
]
for (const c of GREEN) {
  test(`green: "${c}" passes with exit 0`, () => {
    const r = runGuardOn(cls(c))
    assert.equal(r.status, 0, r.stdout + r.stderr)
  })
}

test('scope: a .test.tsx file is not scanned', () => {
  assert.equal(runGuardOn(cls('p-7'), 'components/x.test.tsx').status, 0)
})

test('scope: a file under lib/design is not scanned', () => {
  assert.equal(runGuardOn(cls('p-7'), 'lib/design/x.ts').status, 0)
})

test('B1: whole-tree run exits 0 on the repo', () => {
  const r = ran(runNode('check-design-tokens.mjs', [HOOK], { timeout: 60_000 }))
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('--report exits 0 and prints per-family counts', () => {
  const r = ran(runNode('check-design-tokens.mjs', [HOOK, '--report'], { timeout: 60_000 }))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.ok(r.stdout.trim().length > 0)
})

// ---- lock-2 round 1 (G1-G9) ----
const hits = (r, rule, tok) =>
  (r.stdout + r.stderr).split('\n').filter((l) => l.includes(`${rule}  ${tok}`)).length

test('K1: whole-tree run from a path containing /.claude/worktrees/ exits 0 (no stale entries)', () => {
  const root = mkdtempSync(join(tmpdir(), 'design-tokens-wt-'))
  try {
    const wt = join(root, '.claude/worktrees/x')
    mkdirSync(join(wt, '.claude/hooks'), { recursive: true })
    copyFileSync(HOOK, join(wt, '.claude/hooks/check-design-tokens.mjs'))
    const repo = join(dirname(HOOK), '../..')
    for (const n of ['apps', 'node_modules', 'package.json'])
      symlinkSync(join(repo, n), join(wt, n))
    const r = ran(
      runNode('check-design-tokens.mjs', [join(wt, '.claude/hooks/check-design-tokens.mjs')], {
        timeout: 60_000,
      }),
    )
    assert.equal(r.status, 0, r.stdout + r.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('K2: a staged .css with @apply px-inline blocks naming R2', () => {
  const r = runGuardOn('.a {\n  @apply flex px-inline;\n}\n', 'app/fixture.css')
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.ok(named(r, 'R2'))
})

test('K2: a staged .css with @apply p-2 passes', () => {
  assert.equal(runGuardOn('.a {\n  @apply flex p-2;\n}\n', 'app/fixture.css').status, 0)
})

test('K3: an apostrophe in JSX text does not hide a className (R1 and R8)', () => {
  const r = runGuardOn(
    `export const X = () => <p>It's <strong className="md:p-7">x</strong> you've</p>\n`,
  )
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.ok(named(r, 'R1'))
  assert.ok(named(r, 'R8'))
})

for (const [rule, c] of [
  ['R1', 'scroll-mt-7'],
  ['R1', 'indent-7'],
  ['R4', 'inset-ring-2'],
  ['R4', 'stroke-2'],
]) {
  test(`K4: "${c}" blocks naming ${rule}`, () => {
    const r = runGuardOn(cls(c))
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.ok(named(r, rule), r.stdout + r.stderr)
  })
}

test('K4: "stroke-none" passes', () => {
  assert.equal(runGuardOn(cls('stroke-none')).status, 0)
})

test('K5: a leading-! important "!p-2" blocks naming R9', () => {
  const r = runGuardOn(cls('!p-2'))
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.ok(named(r, 'R9'))
})

test('K6: title= on an iframe passes', () => {
  assert.equal(runGuardOn('export const X = () => <iframe title="Video" />\n').status, 0)
})

for (const tag of ['abbr', 'div']) {
  test(`K6: title= on <${tag}> still blocks naming R10`, () => {
    const r = runGuardOn(`export const X = () => <${tag} title="x">y</${tag}>\n`)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.ok(named(r, 'R10'))
  })
}

test('K7: prose "Ticket #1677" in lib/email passes', () => {
  assert.equal(runGuardOn('export const s = "Ticket #1677"\n', 'lib/email/x.ts').status, 0)
})

for (const src of [
  'export const s = `<p style="color:#123">x</p>`\n',
  "const BRAND = '#1a2b3c'\n",
  "export const o = { color: '#fff' }\n",
]) {
  test(`K7: hex colour context blocks naming R12: ${src.trim()}`, () => {
    const r = runGuardOn(src, 'lib/email/x.ts')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.ok(named(r, 'R12'))
  })
}

test('K8: two identical bad tokens on one line are both reported', () => {
  const r = runGuardOn('export const X = () => <div className="p-7"><i className="p-7" /></div>\n')
  assert.equal(hits(r, 'R1', 'p-7'), 2, r.stdout + r.stderr)
})

test('K8: one bad className token is reported once, not once per scan pass', () => {
  const r = runGuardOn('export const X = () => <div className="p-7" />\n')
  assert.equal(hits(r, 'R1', 'p-7'), 1, r.stdout + r.stderr)
})
