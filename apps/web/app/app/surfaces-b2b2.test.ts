import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const APP = import.meta.dirname
const WEB = join(APP, '..', '..')
const src = (rel: string) => readFileSync(join(APP, rel), 'utf8')

const TABLE_SITES = [
  'admin/dashboard/students/[id]/_components/session-history-table.tsx',
  'admin/internal-exams/_components/attempts-table.tsx',
  'admin/dashboard/_components/student-table-shell.tsx',
  'admin/internal-exams/_components/codes-table.tsx',
  'admin/students/_components/student-table.tsx',
  'admin/questions/_components/question-table.tsx',
  'internal-exam/_components/my-reports-tab.tsx',
]

const INSET_SITES = [
  'quiz/_components/exam-config-form.tsx',
  'quiz/_components/blocked-start-alert.tsx',
  'admin/syllabus/_components/subject-row.tsx',
  'quiz/_components/explanation-tab.tsx',
  'quiz/report/_components/report-question-row.tsx',
  'admin/syllabus/_components/topic-row.tsx',
  'admin/syllabus/_components/subtopic-row.tsx',
  'quiz/session/_components/dialog-fill-input.tsx',
]

const CARD_SITES = [
  'quiz/_components/draft-card.tsx',
  'quiz/_components/saved-session-card.tsx',
  'quiz/_components/quiz-config-form.tsx',
  'quiz/_components/study-config-form.tsx',
  'quiz/report/_components/result-summary.tsx',
  'dashboard/_components/activity-heatmap.tsx',
  'dashboard/_components/subject-grid.tsx',
  'admin/dashboard/_components/weak-topics-list.tsx',
  'admin/dashboard/_components/recent-activity-list.tsx',
  'vfr-rt/_components/vfr-rt-config-form.tsx',
  'vfr-rt/_components/vfr-rt-practice-sections.tsx',
  'admin/internal-exams/_components/issue-code-form.tsx',
]

const CARD_LIST_SITES = [
  'quiz/report/_components/question-breakdown.tsx',
  'quiz/_components/statistics-tab.tsx',
  'quiz/_components/topic-list.tsx',
  'progress/_components/subject-breakdown.tsx',
  'admin/exam-config/_components/exam-config-page-shell.tsx',
  'reports/_components/reports-list.tsx',
]

const ALL_SITES = [
  ...TABLE_SITES,
  ...INSET_SITES,
  ...CARD_SITES,
  ...CARD_LIST_SITES,
  'admin/exam-config/_components/subject-config-card.tsx',
  'internal-exam/_components/available-tab.tsx',
  'reports/_components/session-card.tsx',
]

describe('B2b-2 surfaces (source contract)', () => {
  it.each(TABLE_SITES)('AC3: %s has no rounded-md border wrapper', (f) => {
    expect(src(f)).not.toMatch(/rounded-md border/)
  })

  it.each(INSET_SITES)('AC7: %s uses InsetPanel', (f) => {
    const s = src(f)
    expect(s).toContain('<InsetPanel')
    expect(s).toContain('@/components/kit/inset-panel')
  })

  it('AC7: issued-code-panel is unchanged (no InsetPanel)', () => {
    expect(src('admin/internal-exams/_components/issued-code-panel.tsx')).not.toContain(
      'InsetPanel',
    )
  })

  it.each(CARD_SITES)('AC8: %s renders Card without hand-built frame', (f) => {
    const s = src(f)
    expect(s).toContain('<Card')
    expect(s).not.toContain('rounded-xl border border-border bg-card')
  })

  it.each(ALL_SITES)('AC8: %s has no hand-built card frame', (f) => {
    expect(src(f)).not.toContain('rounded-xl border border-border bg-card')
  })

  it.each(CARD_LIST_SITES)('AC10: %s uses CardList', (f) => {
    expect(src(f)).toContain('<CardList')
  })

  it.each([
    'quiz/report/_components/question-breakdown.tsx',
    'quiz/_components/statistics-tab.tsx',
    'quiz/_components/topic-list.tsx',
    'progress/_components/subject-breakdown.tsx',
  ])('AC10: %s rows carry no border-b', (f) => {
    const s = src(f)
    expect(s).not.toContain('last:border-b-0')
    expect(s).not.toMatch(/border-b(?![-\w])/)
  })

  it('AC10: SubjectRow root has no border-border/rounded-lg', () => {
    const s = src('progress/_components/subject-breakdown.tsx')
    expect(s).not.toContain('rounded-lg border border-border')
  })

  it('AC10: exam-config subject-config-card root has no frame', () => {
    const s = src('admin/exam-config/_components/subject-config-card.tsx')
    expect(s).not.toContain('rounded-lg border border-border bg-card')
  })

  it('AC10: available-tab keeps testids inside a Card', () => {
    const s = src('internal-exam/_components/available-tab.tsx')
    expect(s).toContain('<Card className="gap-0 py-0"')
    expect(s).toContain('available-list')
    expect(s).toContain('available-row-')
  })

  it('AC12: quiz-draft-delete.spec.ts no longer references rounded-xl', () => {
    const s = readFileSync(join(WEB, 'e2e/quiz-draft-delete.spec.ts'), 'utf8')
    expect(s).not.toContain('rounded-xl')
    expect(s).toContain("getByTestId('draft-card')")
  })
})
