import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

describe('breakpoints: md and 2xl removed (AC scan)', () => {
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
})
