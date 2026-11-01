import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const BIOME = path.join(REPO, 'node_modules/.bin/biome')
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8')

type Override = {
  includes?: string[]
  linter?: { rules?: Record<string, Record<string, unknown>> }
}
const cfg = JSON.parse(read('biome.json')) as { overrides: Override[] }

// biome lint --stdin-file-path never reports diagnostics (always "contents aren't fixed"),
// so lint real files in a scratch copy of the config with the same relative layout.
let dir = ''
const lint = (rel: string, code: string) => {
  const abs = path.join(dir, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, `${code}\n`)
  return spawnSync(BIOME, ['lint', '--reporter=json', rel], { cwd: dir, encoding: 'utf8' })
}
const rules = (r: { stdout: string }): string[] => {
  const json = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)) as {
    diagnostics: { category: string }[]
  }
  return json.diagnostics.map((d) => d.category)
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'biome-lock-'))
  const c = JSON.parse(read('biome.json')) as { vcs: { enabled: boolean } }
  c.vcs.enabled = false
  writeFileSync(path.join(dir, 'biome.json'), JSON.stringify(c))
  cpSync(path.join(REPO, 'biome-plugins'), path.join(dir, 'biome-plugins'), { recursive: true })
  execFileSync(BIOME, ['--version'])
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('biome lock-in (#1677 PR A)', () => {
  it('noRestrictedElements is relaxed only by the test-file globs; heading has 3 ignores; question-table 2 for #1678', () => {
    const level = (v: unknown) =>
      typeof v === 'object' && v !== null && 'level' in v ? (v as { level: unknown }).level : v
    const relaxed = cfg.overrides.filter((o) => {
      const v = o.linter?.rules?.correctness?.noRestrictedElements
      return v !== undefined && level(v) !== 'error'
    })
    expect(relaxed.map((o) => o.includes)).toEqual([
      ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    ])
    const ignores = (rel: string, re: RegExp) => (read(rel).match(re) ?? []).length
    expect(
      ignores(
        'apps/web/components/ui/heading.tsx',
        /biome-ignore lint\/correctness\/noRestrictedElements: Heading primitive/g,
      ),
    ).toBe(3)
    expect(
      ignores(
        'apps/web/app/app/admin/questions/_components/question-table.tsx',
        /biome-ignore lint\/correctness\/noRestrictedElements: .*#1678/g,
      ),
    ).toBe(2)
  })

  it('rejects a raw <button> in components/ui via noRestrictedElements', () => {
    const r = lint(
      'apps/web/components/ui/x.tsx',
      'export const X = () => <button type="button">a</button>',
    )
    expect(r.status).not.toBe(0)
    expect(rules(r)).toEqual(['lint/correctness/noRestrictedElements'])
  })

  it('accepts a Button-based component in components/ui (control)', () => {
    const r = lint(
      'apps/web/components/ui/ok.tsx',
      "import { Button } from '@/components/ui/button'\nexport const Ok = () => <Button>a</Button>",
    )
    expect(r.status).toBe(0)
    expect(rules(r)).toEqual([])
  })

  it('rejects window.confirm via noJsRestrictedProperties', () => {
    const r = lint('apps/web/lib/x.ts', "export const f = () => window.confirm('x')")
    expect(rules(r)).toEqual(['lint/nursery/noJsRestrictedProperties'])
  })

  it('rejects bare confirm via noRestrictedGlobals', () => {
    const r = lint('apps/web/lib/y.ts', "export const f = () => confirm('x')")
    expect(rules(r)).toEqual(['lint/style/noRestrictedGlobals'])
  })

  it('rejects window.alert and window.prompt via noJsRestrictedProperties', () => {
    const a = lint('apps/web/lib/a.ts', "export const f = () => window.alert('x')")
    const p = lint('apps/web/lib/p.ts', "export const f = () => window.prompt('x')")
    expect(rules(a)).toEqual(['lint/nursery/noJsRestrictedProperties'])
    expect(rules(p)).toEqual(['lint/nursery/noJsRestrictedProperties'])
  })

  it('names ConfirmDialog in every native-dialog message in biome.json', () => {
    const text = read('biome.json')
    expect(text).not.toContain('use a Dialog')
    expect(text.match(/use ConfirmDialog/g) ?? []).toHaveLength(6)
  })

  it('accepts clean code (control)', () => {
    expect(lint('apps/web/lib/ok.ts', 'export const f = () => 1').status).toBe(0)
  })
})
