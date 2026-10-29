import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
/** Text from the first line containing `marker` through the next `n` lines. */
const win = (rel: string, marker: string, n = 10) => {
  const lines = src(rel).split('\n')
  const i = lines.findIndex((l) => l.includes(marker))
  expect(i, `${rel} contains ${marker}`).toBeGreaterThanOrEqual(0)
  return lines.slice(i, i + n).join('\n')
}
const QUOTED = /(["'`])((?:(?!\1)[^\n])*)\1/g
const strings = (rel: string) => [...src(rel).matchAll(QUOTED)].map((m) => m[2] ?? '')

const U = 'components/ui/'
const Q = 'app/app/quiz/'
const SESS = `${Q}session/_components/`

describe('buttons and tabs (AC 6, 7)', () => {
  it('button base is label with explicit medium; sm is caption', () => {
    const s = src(`${U}button-variants.ts`)
    expect(s).toContain('text-label')
    expect(s).toContain('font-medium')
    expect(s).not.toMatch(/text-sm\b/)
    expect(s).toContain('text-caption')
  })

  it('tab trigger is label without text-sm or font-medium', () => {
    const w = win(`${U}tabs.tsx`, 'data-slot="tabs-tab"', 6)
    expect(w).toContain('text-label')
    expect(w).not.toMatch(/text-sm\b|font-medium/)
  })

  it('question-tabs override drops text-xs and md:text-sm', () => {
    const s = src(`${Q}_components/question-tabs.tsx`)
    expect(s).not.toMatch(/text-xs|md:text-sm/)
  })
})

describe('fields are body (AC 8)', () => {
  it.each([`${U}input.tsx`, `${U}textarea.tsx`, `${U}select.tsx`])('%s', (f) => {
    const s = src(f)
    expect(s).toContain('text-body')
    expect(s).not.toMatch(/md:text-sm|text-base|text-sm\b/)
  })

  it('select trigger and item are body, SelectLabel is caption', () => {
    expect(win(`${U}select.tsx`, 'data-slot="select-trigger"', 6)).toContain('text-body')
    expect(win(`${U}select.tsx`, 'data-slot="select-item"', 6)).toContain('text-body')
    expect(win(`${U}select.tsx`, 'data-slot="select-label"', 6)).toContain('text-caption')
  })

  it.each([
    `${SESS}short-answer-input.tsx`,
    `${SESS}dialog-blank.tsx`,
    `${Q}_components/comments-tab.tsx`,
    'app/app/admin/exam-config/_components/distribution-editor.tsx',
    'app/app/admin/exam-config/_components/num-field.tsx',
    `${Q}_components/subject-select.tsx`,
  ])('hand-built field %s uses text-body', (f) => {
    expect(src(f)).toContain('text-body')
  })
})

describe('dialogs (AC 9)', () => {
  it.each([
    ['dialog.tsx', 'dialog'],
    ['alert-dialog.tsx', 'alert-dialog'],
  ])('%s title heading, description body', (f, slot) => {
    const title = win(`${U}${f}`, `data-slot="${slot}-title"`, 6)
    expect(title).toContain('text-heading')
    expect(title).not.toMatch(/leading-none|text-base/)
    expect(win(`${U}${f}`, `data-slot="${slot}-description"`, 6)).toContain('text-body')
  })
})

describe('table (AC 10)', () => {
  it('table body, head caption medium muted, no text-sm', () => {
    expect(win(`${U}table.tsx`, 'data-slot="table"', 6)).toContain('text-body')
    const head = win(`${U}table.tsx`, 'data-slot="table-head"', 8)
    expect(head).toContain('text-caption')
    expect(head).toContain('font-medium')
    expect(head).toContain('text-muted-foreground')
    expect(src(`${U}table.tsx`)).not.toMatch(/text-sm\b/)
  })
})

describe('card (AC 11)', () => {
  it('title label semibold; description caption', () => {
    const t = win(`${U}card.tsx`, 'data-slot="card-title"', 6)
    expect(t).toContain('text-label')
    expect(t).toContain('font-semibold')
    expect(t).not.toMatch(/text-base|group-data-\[size=sm\]\/card:text-sm/)
    expect(win(`${U}card.tsx`, 'data-slot="card-description"', 6)).toContain('text-caption')
  })
})

describe('overline-sized chips (AC 12)', () => {
  it.each([
    `${U}badge.tsx`,
    'components/kit/code-chip.tsx',
    `${SESS}keyboard-legend.tsx`,
    'app/app/_components/user-chip.tsx',
    `${Q}_components/comments-tab.tsx`,
    `${SESS}diagram-label-zone.tsx`,
    `${SESS}diagram-label-chip.tsx`,
  ])('%s', (f) => {
    const s = src(f)
    expect(s).toContain('text-overline')
    expect(s).toContain('tracking-normal')
    expect(s).not.toMatch(/text-xs|text-\[/)
  })

  it.each([
    'app/app/admin/syllabus/_components/topic-row.tsx',
    'app/app/admin/syllabus/_components/subtopic-row.tsx',
    'app/app/admin/syllabus/_components/subject-row.tsx',
    'app/app/admin/dashboard/_components/recent-activity-list.tsx',
    'app/app/admin/internal-exams/_components/code-row.tsx',
    'app/app/admin/students/_components/student-table.tsx',
    'app/app/admin/questions/_components/question-table.tsx',
    'app/app/admin/questions/_components/calc-badge.tsx',
  ])('Badge call-site %s has no size override', (f) => {
    expect(src(f)).not.toMatch(/text-xs|text-\[10px\]/)
  })
})

describe('tooltips and info button (AC 13, 14)', () => {
  it('tooltip bodies are caption without font-normal', () => {
    const a = win('app/app/dashboard/_components/info-tooltip.tsx', 'role="tooltip"', 4)
    const b = win(`${Q}_components/question-filter-toggles.tsx`, 'aria-hidden', 3)
    for (const w of [a, b]) {
      expect(w).toContain('text-caption')
      expect(w).not.toContain('font-normal')
    }
  })

  it('info "?" button is size-icon-lg overline', () => {
    const w = win('app/app/dashboard/_components/info-tooltip.tsx', 'aria-describedby', 3)
    expect(w).toContain('size-icon-lg')
    expect(w).toContain('text-overline')
    expect(w).not.toMatch(/\bh-4\b|\bw-4\b|md:h-5/)
  })
})

describe('wordmark (AC 15, 22)', () => {
  const s = src('app/app/_components/wordmark.tsx')
  it('is heading size with the logo tracking token', () => {
    expect(s).toContain('text-heading')
    expect(s).toContain('tracking-logo')
    expect(s).not.toMatch(/text-\[18px\]|tracking-\[/)
  })
  it('plus span is muted, not opacity-45', () => {
    expect(win('app/app/_components/wordmark.tsx', '<span', 1)).toContain('text-muted-foreground')
    expect(s).not.toContain('opacity-45')
  })
})

describe('tab bar and heatmap (AC 16)', () => {
  it('more-sheet tab base is text-micro; rows label; no text-[', () => {
    const s = src('app/app/_components/more-sheet.tsx')
    expect(s).toContain('text-micro')
    expect(s).toContain('text-label')
    expect(s).not.toContain('text-[')
  })

  it('heatmap digits use text-chart and md:text-micro; no arbitrary sizes', () => {
    const cell = src('app/app/dashboard/_components/heatmap-cell.tsx')
    expect(cell).toContain('text-chart')
    expect(cell).toContain('md:text-micro')
    expect(cell).not.toContain('text-[')
    expect(src('app/app/dashboard/_components/heatmap-header.tsx')).not.toContain('text-[')
  })
})

describe('quiz header is caption (AC 17)', () => {
  it.each([
    `${SESS}quiz-session-header-parts.tsx`,
    `${SESS}quiz-session-meta-row.tsx`,
    `${SESS}exam-session-header.tsx`,
    'app/app/_components/session-timer.tsx',
  ])('%s', (f) => {
    const s = src(f)
    expect(s).toContain('text-caption')
    expect(s).not.toMatch(/text-sm\b/)
  })

  it('counter span is caption medium', () => {
    expect(
      strings(`${SESS}quiz-session-header-parts.tsx`).some(
        (x) => /text-caption/.test(x) && /font-medium/.test(x),
      ),
    ).toBe(true)
  })
})

describe('scores (AC 18)', () => {
  it.each([
    'app/app/reports/_components/session-card.tsx',
    `${Q}report/_components/result-summary.tsx`,
  ])('%s big score is heading', (f) => {
    expect(src(f)).toContain('text-heading')
  })

  it.each([
    'app/app/admin/dashboard/_components/weak-topics-list.tsx',
    'app/app/admin/internal-exams/_components/attempts-table.tsx',
    'app/app/internal-exam/_components/my-reports-tab.tsx',
    'app/app/progress/_components/subject-breakdown.tsx',
  ])('%s list score is label semibold tabular', (f) => {
    expect(
      strings(f).some(
        (x) => /text-label/.test(x) && /font-semibold/.test(x) && /tabular-nums/.test(x),
      ),
    ).toBe(true)
  })

  it('topic percentage is caption tabular', () => {
    expect(
      strings('app/app/progress/_components/subject-breakdown.tsx').some(
        (x) => /text-caption/.test(x) && /tabular-nums/.test(x),
      ),
    ).toBe(true)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe('redundant weights (AC 19)', () => {
  it('no class string pairs text-label with font-medium or text-heading with font-semibold', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, f)
        if (rel.endsWith('button-variants.ts')) continue
        for (const x of strings(rel)) {
          if (
            (/(^|[\s:])text-label(\s|$)/.test(x) && /(^|\s)font-medium(\s|$)/.test(x)) ||
            (/(^|[\s:])text-heading(\s|$)/.test(x) && /(^|\s)font-semibold(\s|$)/.test(x))
          )
            hits.push(`${rel}: ${x}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})

describe('missed sites (AC 21)', () => {
  it('issued code is stat, global error is title, no 2xl-9xl', () => {
    const a = src('app/app/admin/internal-exams/_components/issued-code-panel.tsx')
    const b = src('app/global-error.tsx')
    expect(a).toContain('text-stat')
    expect(b).toContain('text-title')
    expect(a + b).not.toMatch(/text-[2-9]xl/)
  })
})
