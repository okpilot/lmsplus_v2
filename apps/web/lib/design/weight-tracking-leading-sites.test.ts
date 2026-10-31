import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const A = 'app/app/'
const U = 'components/ui/'

const LABEL_STRONG = [
  `${A}_components/feedback-panel.tsx`,
  `${A}_components/question-card.tsx`,
  `${A}admin/dashboard/_components/weak-topics-list.tsx`,
  `${A}admin/internal-exams/_components/attempts-table.tsx`,
  `${A}admin/syllabus/_components/subject-row.tsx`,
  `${A}internal-exam/_components/available-tab.tsx`,
  `${A}internal-exam/_components/my-reports-tab.tsx`,
  `${A}progress/_components/subject-breakdown.tsx`,
  `${A}quiz/_components/question-count.tsx`,
  `${A}quiz/_components/statistics-tab.tsx`,
  `${A}quiz/session/_components/quiz-card-header.tsx`,
  `${A}quiz/session/_components/quiz-session-header-parts.tsx`,
  `${U}alert.tsx`,
  `${U}heading.tsx`,
]

const CAPTION_STRONG = [
  `${A}_components/markdown-text.tsx`,
  `${A}_components/user-chip.tsx`,
  `${A}admin/exam-config/_components/distribution-editor.tsx`,
  `${A}admin/questions/_components/question-table.tsx`,
  `${A}dashboard/_components/heatmap-header.tsx`,
  `${A}progress/_components/subject-breakdown.tsx`,
  `${A}quiz/_components/question-grid-squares.tsx`,
  `${A}quiz/_components/topic-tree.tsx`,
  `${A}quiz/report/_components/report-question-row.tsx`,
  `${A}quiz/session/_components/diagram-tap-list.tsx`,
  `${A}quiz/session/_components/keyboard-legend.tsx`,
  `${A}quiz/session/_components/ordering-input-item.tsx`,
  `${U}table.tsx`,
  `${U}tabs.tsx`,
]

describe('weight roles', () => {
  it.each(LABEL_STRONG)('%s uses text-label-strong, no label + font-semibold pair', (f) => {
    const s = src(f)
    expect(s).toContain('text-label-strong')
    expect(s).not.toMatch(/text-label(?![-\w])[^'"`\n]*font-semibold/)
    expect(s).not.toMatch(/font-semibold[^'"`\n]*text-label(?![-\w])/)
  })

  it.each(CAPTION_STRONG)('%s uses text-caption-strong, no caption + font-medium pair', (f) => {
    const s = src(f)
    expect(s).toContain('text-caption-strong')
    expect(s).not.toMatch(/text-caption(?![-\w])[^'"`\n]*font-medium/)
    expect(s).not.toMatch(/font-medium[^'"`\n]*text-caption(?![-\w])/)
  })

  it('question stem is text-question without font-medium or leading-relaxed', () => {
    const s = src(`${A}_components/question-card.tsx`)
    expect(s).toContain('text-question')
    expect(s).not.toMatch(/leading-relaxed/)
    expect(s).not.toContain('font-medium')
  })

  it('sidebar item drops font-normal', () => {
    expect(src(`${A}_components/sidebar-item.tsx`)).not.toContain('font-normal')
  })

  it('heatmap empty-day dash keeps font-normal', () => {
    expect(src(`${A}dashboard/_components/heatmap-cell.tsx`)).toContain('font-normal')
  })

  it('question tabs narrow viewport uses text-caption-strong', () => {
    expect(src(`${A}quiz/_components/question-tabs.tsx`)).toContain(
      'max-[374.98px]:text-caption-strong',
    )
  })

  it('issued code has no font-semibold beside text-stat', () => {
    expect(src(`${A}admin/internal-exams/_components/issued-code-panel.tsx`)).not.toContain(
      'font-semibold',
    )
  })

  it.each([
    `${A}admin/internal-exams/_components/issued-code-panel.tsx`,
    `${A}quiz/_components/exam-countdown-timer.tsx`,
    `${A}dashboard/_components/heatmap-cell.tsx`,
  ])('%s has no font-bold', (f) => {
    expect(src(f)).not.toContain('font-bold')
  })

  it('score ring text weight is 600', () => {
    const s = src(`${A}quiz/report/_components/score-ring.tsx`)
    expect(s).not.toContain('fontWeight="700"')
    expect(s).toContain('fontWeight="600"')
  })

  it('button base carries no explicit font-medium', () => {
    expect(src(`${U}button-variants.ts`)).not.toContain('font-medium')
  })

  it('card title is a single text-label-strong role', () => {
    const s = src(`${U}card.tsx`)
    expect(s).toContain('text-label-strong')
    expect(s).not.toContain('leading-snug')
  })
})

describe('tracking roles', () => {
  it.each([
    `${A}admin/internal-exams/_components/code-row.tsx`,
    `${A}admin/internal-exams/_components/issued-code-panel.tsx`,
    `${A}internal-exam/_components/code-entry-modal.tsx`,
  ])('%s uses tracking-code, no tracking-wider/widest', (f) => {
    const s = src(f)
    expect(s).toContain('tracking-code')
    expect(s).not.toMatch(/tracking-(wider|widest)/)
  })

  it('session table ExamBadge drops tracking-wide', () => {
    expect(src(`${A}reports/_components/session-table.tsx`)).not.toMatch(/tracking-wide/)
  })
})

describe('leading roles', () => {
  it.each([
    [`${A}_components/wordmark.tsx`, 'leading-none'],
    [`${A}admin/dashboard/_components/weak-topics-list.tsx`, 'leading-tight'],
    ['app/consent/_components/consent-checkbox.tsx', 'leading-snug'],
  ])('%s drops %s', (f, cls) => {
    expect(src(f)).not.toContain(cls)
  })

  it.each([
    [`${A}dashboard/_components/heatmap-cell.tsx`, 'leading-none'],
    [`${A}quiz/session/[id]/loading.tsx`, 'leading-8'],
    [`${A}quiz/session/_components/dialog-line.tsx`, 'leading-7'],
  ])('%s keeps %s', (f, cls) => {
    expect(src(f)).toContain(cls)
  })

  it('heatmap total, correct and incorrect counts each keep leading-none', () => {
    expect(
      src(`${A}dashboard/_components/heatmap-cell.tsx`).match(/text-chart[^"]*leading-none/g),
    ).toHaveLength(3)
  })
})

describe('decision ledger', () => {
  it('appends ledger entry 192 on weight, tracking, leading roles', () => {
    const s = readFileSync(path.join(ROOT, '../../docs/decisions.md'), 'utf8')
    expect(s).toMatch(/^## 192 — 2026-10-31 — Weight, tracking, leading are roles/m)
  })
})
