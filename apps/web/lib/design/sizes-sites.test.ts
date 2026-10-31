import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = path.resolve(ROOT, '../..')
const A = 'app/app/'
const resolve = (rel: string): string => {
  const direct = path.join(ROOT, A, rel)
  if (existsSync(direct)) return direct
  const viaComponents = path.join(ROOT, A, path.dirname(rel), '_components', path.basename(rel))
  if (existsSync(viaComponents)) return viaComponents
  throw new Error(`missing source file: ${rel}`)
}
const app = (rel: string) => readFileSync(resolve(rel), 'utf8')
const root = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const SKELETONS = [
  'loading.tsx',
  'admin/dashboard/loading.tsx',
  'admin/dashboard/students/[id]/loading.tsx',
  'admin/exam-config/loading.tsx',
  'admin/exam-config/exam-config-rows-skeleton.tsx',
  'admin/questions/loading.tsx',
  'admin/questions/questions-content-fallback.tsx',
  'admin/students/loading.tsx',
  'admin/syllabus/loading.tsx',
  'admin/syllabus/syllabus-content-skeleton.tsx',
  'admin/internal-exams/internal-exams-fallback.tsx',
  'dashboard/loading.tsx',
  'dashboard/dashboard-skeletons.tsx',
  'internal-exam/report/loading.tsx',
  'progress/loading.tsx',
  'progress/progress-content-skeleton.tsx',
  'quiz/loading.tsx',
  'quiz/comments-skeleton.tsx',
  'quiz/statistics-tab.tsx',
  'quiz/session/quiz-session-loader.tsx',
  'quiz/session/[id]/loading.tsx',
  'reports/loading.tsx',
  'reports/reports-content-fallback.tsx',
  'settings/loading.tsx',
  'settings/settings-content-skeleton.tsx',
]

// Numeric size utilities: allowed steps are h-1.5 (progress bar) and size-8 in comments-skeleton (32px avatar).
const NUMERIC = /(?<![\w-])((?:min-h|min-w|h|w|size)-\d[\w.]*)/g
const ALLOWED = new Set(['h-1.5'])

describe('skeleton files use size tokens (AC: class-scan)', () => {
  it.each(SKELETONS)('%s has no numeric h-/w-/size-/min-h-/min-w- above the allowed steps', (f) => {
    const allowed = new Set(ALLOWED)
    if (f === 'quiz/comments-skeleton.tsx') allowed.add('size-8')
    const found = [...app(f).matchAll(NUMERIC)]
      .map((m) => m[1] ?? '')
      .filter((c) => !allowed.has(c))
    expect(found).toEqual([])
  })

  it('skeleton line, title, row, card and chart roles use skeleton-* tokens', () => {
    const all = SKELETONS.map(app).join('\n')
    for (const t of [
      'h-skeleton-line',
      'h-skeleton-title',
      'h-skeleton-row',
      'h-skeleton-row-lg',
      'h-skeleton-card',
      'h-skeleton-card-lg',
      'h-skeleton-chart',
      'w-skeleton-w',
      'w-skeleton-w-lg',
    ])
      expect(all).toContain(t)
    expect(app('admin/dashboard/loading.tsx')).toContain('h-skeleton-chart-lg')
  })

  it('the admin dashboard and student pages use skeleton heights', () => {
    const dash = app('admin/dashboard/page.tsx')
    expect(dash).toContain('h-skeleton-card')
    expect(dash).toContain('h-skeleton-chart-lg')
    expect(dash).toContain('h-skeleton-chart')
    expect(dash).not.toMatch(/(?<![\w-])h-(28|96|64)\b/)
    expect(app('admin/dashboard/students/[id]/page.tsx')).toContain('h-skeleton-chart-lg')
    expect(app('admin/students/page.tsx')).toContain('h-skeleton-chart-lg')
    expect(app('vfr-rt/page.tsx')).toContain('h-skeleton-chart')
    expect(app('quiz/quiz-page-tabs.tsx')).toContain('h-skeleton-chart')
    expect(app('internal-exam/page.tsx')).toContain('h-skeleton-card')
    expect(app('quiz/session/lazy-answer-inputs.tsx')).toContain('h-skeleton-chart')
  })
})

describe('comments avatar stays 32px (OD8)', () => {
  it('comments-tab avatar is h-8 w-8', () => {
    const s = app('quiz/comments-tab.tsx')
    expect(s).toContain('h-8 w-8')
    expect(s).not.toMatch(/(?<![\w-])(h|w)-avatar/)
  })
  it('comments-skeleton avatar stays size-8', () => {
    const s = app('quiz/comments-skeleton.tsx')
    expect(s).toContain('size-8')
    expect(s).not.toContain('size-avatar')
  })
})

describe('control, avatar and column sizes', () => {
  it('pagination min-w is control-sm', () => {
    const s = app('pagination-bar.tsx')
    expect(s).toContain('min-w-control-sm')
    expect(s).not.toMatch(/min-w-8\b/)
  })
  it('sidebar row is h-control', () => {
    const s = app('sidebar-item.tsx')
    expect(s).toContain('h-control')
    expect(s).not.toMatch(/(?<![\w-])h-9\b/)
  })
  it('diagram-tap-list: numeral circle, chip, tap rows on tokens', () => {
    const s = app('quiz/session/diagram-tap-list.tsx')
    expect(s).toContain('size-avatar')
    expect(s).toContain('h-control-sm')
    expect(s).toContain('min-h-control')
    expect(s).toContain('min-h-control-sm')
    expect(s).not.toMatch(/(?<![\w-])(size-6|h-8|min-h-11|min-h-8)\b/)
  })
  it('button segment and badge circle use control-sm / avatar', () => {
    expect(root('components/ui/button-variants.ts')).toMatch(/segment:\s*['"`][^'"`]*h-control-sm/)
    expect(root('components/ui/badge.tsx')).toContain('size-avatar')
  })
  it('info tooltip is w-popover-sm with no md width', () => {
    const s = app('dashboard/info-tooltip.tsx')
    expect(s).toContain('w-popover-sm')
    expect(s).not.toMatch(/(?<![\w-])w-(48|56)\b/)
  })
  it('syllabus code columns are w-inset-lg', () => {
    for (const f of [
      'admin/syllabus/subject-row.tsx',
      'admin/syllabus/subtopic-row.tsx',
      'admin/syllabus/topic-row.tsx',
    ])
      expect(app(f)).toContain('w-inset-lg')
  })
  it.each([
    ['admin/internal-exams/codes-table.tsx', ['w-col-md', 'w-col-code', 'w-col-sm']],
    ['admin/questions/question-table.tsx', ['w-col-md', 'w-col-code', 'w-col-sm', 'w-col-xs']],
    [
      'admin/students/student-table.tsx',
      ['w-col-md', 'w-col-code', 'w-col-sm', 'w-col-xs', 'w-col-lg'],
    ],
    ['admin/students/student-filters.tsx', ['w-col-sm', 'w-col-lg']],
    ['admin/questions/question-filter-selects.tsx', ['w-col-md', 'w-col-sm']],
    ['admin/questions/question-filters.tsx', ['w-col-lg']],
    ['admin/syllabus/syllabus-manager.tsx', ['w-col-xs', 'w-col-sm']],
    ['admin/syllabus/subject-row.tsx', ['w-col-xs', 'w-col-sm', 'w-col-code']],
    ['admin/syllabus/subtopic-row.tsx', ['w-col-sm']],
    ['admin/syllabus/topic-row.tsx', ['w-col-sm', 'w-col-code']],
  ])('%s uses col-* widths', (f, tokens) => {
    const s = app(f)
    for (const t of tokens) expect(s).toContain(t)
    expect(s).not.toMatch(/(?<![\w-])w-(20|24|28|32|40|44|56)\b/)
  })
})

describe('no-look-change sites on exact tokens', () => {
  it('chip, field-min and popover tokens replace numeric sizes', () => {
    expect(root('components/ui/badge.tsx')).toContain('h-chip')
    expect(root('components/ui/textarea.tsx')).toContain('min-h-field-min')
    expect(root('components/ui/popover.tsx')).toContain('w-popover')
    expect(root('components/ui/select.tsx')).toContain('min-w-menu-min')
  })
  it('button sm and input lg use control tokens', () => {
    expect(root('components/ui/button-variants.ts')).toMatch(/\bsm:\s*['"`][^'"`]*h-control-sm/)
    expect(root('components/ui/input.tsx')).toContain('h-control-lg')
  })
})

describe('decisions ledger', () => {
  const ledger = readFileSync(path.join(REPO, 'docs/decisions.md'), 'utf8').split('\n')
  it('has entry 196 on sizes, amending 185', () => {
    const l = ledger.find((x) => /^## 196 /.test(x))
    expect(l).toBeDefined()
    expect(l).toContain('Amends 185')
    expect(l).toContain('#1433')
  })
  it('entry 185 ends with " Amended by 196."', () => {
    const l = ledger.find((x) => /^## 185 /.test(x))
    expect(l?.endsWith(' Amended by 196.')).toBe(true)
  })
})
