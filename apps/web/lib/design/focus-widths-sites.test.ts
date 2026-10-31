import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(tsx|ts)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p)
  }
  return out
}

const RAW_WIDTH =
  /(?<![\w-])(?:ring-[123]|ring-inset|outline-2|-outline-offset-2|outline-offset-2|border-2|border-[lrtb]-2)(?![\w-])/g

describe('PR18 focus ring and width tokens', () => {
  it('no ring-1|2|3, ring-inset, outline-2, -outline-offset-2 or border-2 in components/app', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        const text = readFileSync(f, 'utf8')
        for (const m of text.matchAll(RAW_WIDTH)) {
          hits.push(
            `${path.relative(ROOT, f)}:${text.slice(0, m.index).split('\n').length} ${m[0]}`,
          )
        }
      }
    }
    expect(hits).toEqual([])
  })

  it.each([
    'components/ui/button-variants.ts',
    'components/ui/badge.tsx',
    'components/ui/checkbox.tsx',
    'components/ui/radio-group.tsx',
    'components/ui/switch.tsx',
    'components/ui/input.tsx',
    'components/ui/textarea.tsx',
    'components/ui/select.tsx',
  ])('%s carries outline-focus and outline-offset-focus', (f) => {
    const s = read(f)
    expect(s).toContain('focus-visible:outline-solid')
    expect(s).toContain('focus-visible:outline-focus')
    expect(s).toContain('focus-visible:outline-offset-focus')
    expect(s).not.toContain('focus-visible:ring-focus')
    expect(s).not.toContain('focus-visible:ring-offset-background')
  })

  it.each([
    'components/ui/button-variants.ts',
    'components/ui/checkbox.tsx',
    'components/ui/radio-group.tsx',
    'components/ui/switch.tsx',
    'components/ui/input.tsx',
    'components/ui/textarea.tsx',
    'components/ui/select.tsx',
  ])('%s invalid ring is aria-invalid:ring-focus', (f) => {
    expect(read(f)).toContain('aria-invalid:ring-focus')
  })

  it('slider hover and active rings are ring-focus; focus (on the nested range input) is an outline with the gap', () => {
    const s = read('components/ui/slider.tsx')
    for (const c of [
      'hover:ring-focus',
      'active:ring-focus',
      'has-focus-visible:outline-solid',
      'has-focus-visible:outline-focus',
      'has-focus-visible:outline-offset-focus',
      'has-focus-visible:outline-ring',
    ]) {
      expect(s).toContain(c)
    }
    expect(s).not.toMatch(/(?<![\w-])focus-visible:outline/)
    expect(s).not.toContain('focus-visible:outline-hidden')
    expect(s).not.toContain('focus-visible:ring-focus')
    expect(s).not.toContain('focus-visible:ring-offset-background')
  })

  it.each([
    'app/app/admin/dashboard/_components/student-table-helpers.tsx',
    'app/app/admin/dashboard/students/[id]/_components/clickable-session-row.tsx',
    'app/app/admin/internal-exams/_components/attempts-table.tsx',
    'app/app/internal-exam/_components/my-reports-tab.tsx',
    'app/app/reports/_components/session-table.tsx',
  ])('%s focuses with outline-focus and an inset -outline-offset-focus', (f) => {
    const s = read(f)
    expect(s).toContain('focus-visible:outline-focus')
    expect(s).toContain('focus-visible:-outline-offset-focus')
  })

  it.each(['app/app/admin/dashboard/_components/recent-activity-list.tsx'])(
    '%s focuses with outline-focus and an inset -outline-offset-focus',
    (f) => {
      const s = read(f)
      expect(s).toContain('focus-visible:outline-focus')
      expect(s).toContain('focus-visible:-outline-offset-focus')
    },
  )

  it('tabs focus with outline-focus and outline-offset-focus', () => {
    const s = read('components/ui/tabs.tsx')
    expect(s).toContain('focus-visible:outline-focus')
    expect(s).toContain('focus-visible:outline-offset-focus')
  })

  const rowLine = (f: string, marker: string) =>
    read(f)
      .split('\n')
      .find((l) => l.includes(marker)) ?? ''

  it.each([
    ['app/app/admin/exam-config/_components/subject-config-card.tsx', 'flex min-w-0 flex-1'],
    ['app/app/progress/_components/subject-breakdown.tsx', 'flex w-full items-center'],
    ['app/app/reports/_components/session-card.tsx', 'block transition-colors'],
  ])('%s row focuses with an inset outline', (f, marker) => {
    const l = rowLine(f, marker)
    expect(l).toMatch(/(?<![\w-])focus-visible:outline-solid(?![\w-])/)
    expect(l).toContain('focus-visible:outline-focus')
    expect(l).toContain('focus-visible:-outline-offset-focus')
    expect(l).not.toContain('ring-offset-background')
  })

  it('subject-config-card pill toggle focuses with an outline and a gap', () => {
    const l = rowLine(
      'app/app/admin/exam-config/_components/subject-config-card.tsx',
      'rounded-pill',
    )
    expect(l).toContain('focus-visible:outline-solid')
    expect(l).toContain('focus-visible:outline-focus')
    expect(l).toContain('focus-visible:outline-offset-focus')
    expect(l).not.toContain('focus-visible:ring-focus')
    expect(l).not.toContain('focus-visible:ring-offset-background')
  })

  it('no non-test file under app/ or components/ uses focus-visible:ring-offset-', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        if (/\.test\.[tj]sx?$/.test(f)) continue
        if (read(path.relative(ROOT, f)).includes('focus-visible:ring-offset-')) hits.push(f)
      }
    }
    expect(hits).toEqual([])
  })

  it('every outline-none element with a focus outline width resets the style with outline-solid', () => {
    const hits: string[] = []
    for (const dir of ['app', 'components']) {
      for (const f of walk(path.join(ROOT, dir))) {
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((l, i) => {
            if (
              /(?<![\w-])outline-none(?![\w-])/.test(l) &&
              /focus-visible:outline-focus/.test(l) &&
              !/(?<![\w-])focus-visible:outline-solid(?![\w-])/.test(l)
            )
              hits.push(`${path.relative(ROOT, f)}:${i + 1}`)
          })
      }
    }
    expect(hits).toEqual([])
  })

  it('width tokens replace ring-1, ring-2, border-2 and z-10', () => {
    expect(read('components/ui/card.tsx')).toContain('ring-surface')
    expect(read('components/ui/dialog.tsx')).toContain('ring-surface')
    expect(read('components/ui/select.tsx')).toMatch(/z-sticky/)
    expect(read('components/ui/select.tsx')).not.toMatch(/(?<![\w-])z-10(?![\w-])/)
    expect(read('app/app/dashboard/_components/heatmap-cell.tsx')).toContain('ring-select')
    expect(read('app/app/quiz/_components/filter-pill.tsx')).toContain('ring-select')
    expect(read('app/app/admin/internal-exams/_components/issued-code-panel.tsx')).toContain(
      'border-emphasis',
    )
    expect(read('app/app/quiz/_components/subject-select.tsx')).toContain('border-l-emphasis')
    expect(read('app/app/quiz/session/_components/keyboard-legend.tsx')).toContain(
      'border-b-emphasis',
    )
    expect(read('app/app/_components/answer-options.tsx')).toContain('outline-focus')
  })

  it('CardList keeps its clip', () => {
    const s = read('components/ui/card.tsx')
    expect(s).toContain("'gap-0 overflow-hidden py-0 divide-y divide-border'")
    expect(s).not.toContain('*:first:rounded-t-card')
  })

  it('recent-activity-list does not clip and does not round its rows', () => {
    const s = read('app/app/admin/dashboard/_components/recent-activity-list.tsx')
    expect(s).not.toContain('overflow-hidden')
    expect(s).not.toContain('rounded-t-card')
    expect(s).not.toContain('rounded-b-card')
  })

  it('table container scrolls and clips; no scroller wrapper', () => {
    const s = read('components/ui/table.tsx')
    expect(s).not.toContain('table-scroller')
    expect(s).toContain('overflow-x-auto')
    expect(s).not.toContain('w-[calc')
  })

  it('decisions.md ends with entry 194 and marks 178 as amended by 179, 194', () => {
    const d = read('../../docs/decisions.md')
    expect(d).toMatch(/^## 194 — 2026-10-31 — One focus style/m)
    expect(d).toMatch(/^## 178 .*Amended by 179, 194\.\s*$/m)
  })

  it('destructive badge focus outline is solid destructive, and tabs reset the outline style', () => {
    expect(read('components/ui/badge.tsx')).toContain('focus-visible:outline-destructive')
    expect(read('components/ui/badge.tsx')).not.toContain('focus-visible:outline-invalid-ring')
    expect(read('components/ui/tabs.tsx')).toContain('focus-visible:outline-solid')
  })
})
