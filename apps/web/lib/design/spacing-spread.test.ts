import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const A = 'app/app/'
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')
const cls = (name: string) =>
  new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)

const SITES: Array<[string, string, string]> = [
  [`${A}_components/feedback-panel.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}admin/dashboard/_components/student-table-shell.tsx`, 'space-y-3', 'space-y-stack'],
  [
    `${A}admin/dashboard/students/[id]/_components/session-history-table.tsx`,
    'space-y-3',
    'space-y-stack',
  ],
  [
    `${A}admin/dashboard/students/[id]/_components/student-header.tsx`,
    'space-y-3',
    'space-y-stack',
  ],
  [`${A}admin/internal-exams/_components/attempts-table.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}admin/internal-exams/_components/codes-table.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}admin/questions/_components/option-editor.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}admin/syllabus/_components/syllabus-content-skeleton.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}internal-exam/_components/available-tab.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}internal-exam/_components/code-entry-modal.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/comments-skeleton.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/comments-tab.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/exam-config-form.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/explanation-tab.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/question-count.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/_components/statistics-tab.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}quiz/session/_components/ordering-input.tsx`, 'space-y-3', 'space-y-stack'],
  [`${A}_components/question-card.tsx`, 'space-y-4', 'space-y-stack'],
  [`${A}admin/dashboard/_components/weak-topics-list.tsx`, 'space-y-4', 'space-y-stack'],
  [`${A}quiz/session/_components/quiz-main-panel.tsx`, 'space-y-4', 'space-y-stack'],
  [`${A}_components/session-summary.tsx`, 'space-y-6', 'space-y-section'],
  [
    `${A}admin/dashboard/sessions/[id]/_components/admin-report-card.tsx`,
    'space-y-6',
    'space-y-section',
  ],
  [`${A}quiz/report/_components/report-card.tsx`, 'space-y-6', 'space-y-section'],
  [`${A}quiz/session/_components/quiz-session-loader.tsx`, 'space-y-6', 'space-y-section'],
  [`${A}_components/sidebar-item.tsx`, 'px-2.5', 'px-pad-control'],
  [`${A}_components/sidebar-nav.tsx`, 'px-2.5', 'px-pad-control'],
  ['components/ui/button-variants.ts', 'px-2.5', 'px-pad-control'],
  ['components/ui/textarea.tsx', 'px-2.5', 'px-pad-control'],
  [`${A}quiz/_components/mode-toggle.tsx`, 'space-y-1.5', 'space-y-stack-sm'],
  [`${A}quiz/_components/subject-select.tsx`, 'space-y-1.5', 'space-y-stack-sm'],
  [`${A}admin/exam-config/_components/config-form-dialog.tsx`, 'space-y-3', 'space-y-stack-lg'],
  [`${A}admin/internal-exams/_components/internal-exams-tabs.tsx`, 'space-y-4', 'space-y-section'],
  [`${A}admin/questions/_components/questions-page-shell.tsx`, 'space-y-4', 'space-y-section'],
  [`${A}admin/students/_components/students-page-shell.tsx`, 'space-y-4', 'space-y-section'],
  [`${A}internal-exam/_components/internal-exam-tabs.tsx`, 'space-y-4', 'space-y-section'],
  [`${A}quiz/_components/quiz-tabs.tsx`, 'space-y-4', 'space-y-section'],
  [`${A}admin/questions/_components/difficulty-status-select.tsx`, 'gap-3', 'gap-stack-lg'],
  [`${A}admin/questions/_components/question-meta-fields.tsx`, 'gap-3', 'gap-stack-lg'],
  [`${A}admin/questions/_components/syllabus-cascader.tsx`, 'gap-3', 'gap-stack-lg'],
  [`${A}quiz/_components/question-filters.tsx`, 'space-y-2.5', 'space-y-stack-sm'],
  [`${A}quiz/_components/quiz-config-form.tsx`, 'space-y-5', 'space-y-stack-lg'],
  [`${A}quiz/_components/study-config-form.tsx`, 'space-y-5', 'space-y-stack-lg'],
  [`${A}vfr-rt/_components/vfr-rt-config-form.tsx`, 'space-y-5', 'space-y-stack-lg'],
  ['app/auth/reset-password/_components/reset-password-form.tsx', 'space-y-1', 'space-y-stack-sm'],
  ['app/consent/_components/consent-form.tsx', 'space-y-6', 'space-y-stack-lg'],
  ['components/ui/input.tsx', 'px-2.5', 'px-pad-control'],
]

describe('spacing spread (#1674 D12 D13 D16)', () => {
  it.each(SITES)('%s uses %s -> %s', (f, oldCls, newCls) => {
    const t = src(f)
    expect(cls(newCls).test(t)).toBe(true)
    expect(cls(oldCls).test(t)).toBe(false)
  })

  it('empty-state, statistics and saved-session-resume pad with py-6', () => {
    expect(cls('py-6').test(src(`${A}quiz/_components/statistics-tab.tsx`))).toBe(true)
    expect(cls('py-8').test(src(`${A}quiz/_components/statistics-tab.tsx`))).toBe(false)
    const r = src(`${A}quiz/session/_components/saved-session-resume.tsx`)
    expect(cls('py-6').test(r)).toBe(true)
    expect(cls('py-10').test(r)).toBe(false)
  })

  it('no inline or row spacing utility remains in app or components', () => {
    const re = /(?<![\w-])-?(p|m|gap|space)-?[xytblr]?-(inline|row)(?![\w-])/
    const out: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const p = `${d}/${e.name}`
        if (e.isDirectory()) walk(p)
        else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) && re.test(src(p)))
          out.push(p)
      }
    }
    walk('app')
    walk('components')
    expect(out).toEqual([])
  })

  it('docs/decisions.md ends with decision 197 on spacing', () => {
    const d = readFileSync(path.join(ROOT, '../../docs/decisions.md'), 'utf8')
    expect(d).toMatch(
      /^## 197 — 2026-10-31 — Spacing:.*pad-control-sm\|pad-control\|pad-control-lg/m,
    )
  })
})
