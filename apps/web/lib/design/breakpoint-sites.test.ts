import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

function walk(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel)
    return /\.(tsx?|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) ? [rel] : []
  })
}

const FILES = [...walk('app'), ...walk('components')]
const BANNED = /(^|[\s"'`])(md|2xl):/

describe('breakpoints: md and 2xl removed (AC scan)', () => {
  it('scans a non-empty file set', () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('no md: or 2xl: variant in app/ components/ source', () => {
    const hits = FILES.filter((f) => BANNED.test(src(f)))
    expect(hits).toEqual([])
  })

  it('no max-[...px]: arbitrary breakpoint in app/ components/ source', () => {
    const hits = FILES.filter((f) => /max-\[[\d.]+px\]:/.test(src(f)))
    expect(hits).toEqual([])
  })

  it('question-tabs uses max-tiny: for the phone cut-off', () => {
    const s = src('app/app/quiz/_components/question-tabs.tsx')
    expect(s).toContain('max-tiny:gap-0')
    expect(s).toContain('max-tiny:text-caption')
  })

  it('admin KPI grid is 2 columns from sm and 3 from lg', () => {
    for (const f of [
      'app/app/admin/dashboard/_components/kpi-cards.tsx',
      'app/app/admin/dashboard/loading.tsx',
      'app/app/admin/dashboard/page.tsx',
    ]) {
      const s = src(f)
      expect(s, f).toContain('sm:grid-cols-2')
      expect(s, f).toContain('lg:grid-cols-3')
    }
  })

  it('issue-code form changes at lg', () => {
    const s = src('app/app/admin/internal-exams/_components/issue-code-form.tsx')
    expect(s).toContain('lg:grid-cols-(--layout-issue-code')
    expect(s).toContain('lg:items-end')
  })

  it('scale.ts comment points at the enforcement PR (#1677)', () => {
    expect(src('lib/design/scale.ts')).toContain('until the enforcement PR (#1677)')
  })
})
