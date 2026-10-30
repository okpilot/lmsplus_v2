import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const RAISED = [
  'app/_components/new-version-banner.tsx',
  'components/ui/popover.tsx',
  'components/ui/select.tsx',
  'app/app/admin/questions/_components/bulk-actions-bar.tsx',
]
const OVERLAY = ['components/ui/dialog.tsx', 'components/ui/alert-dialog.tsx']

describe('elevation sites use shadow tokens', () => {
  it.each(RAISED)('%s uses shadow-raised', (f) => {
    const s = src(f)
    expect(s).toMatch(/\bshadow-raised\b/)
    expect(s).not.toMatch(/\bshadow-(lg|sm)\b/)
  })

  it.each(OVERLAY)('%s uses shadow-overlay', (f) => {
    const s = src(f)
    expect(s).toMatch(/\bshadow-overlay\b/)
    expect(s).not.toMatch(/\bshadow-lg\b/)
  })
})

describe('scrim sites use the scrim token', () => {
  it.each(['components/ui/dialog.tsx', 'components/ui/alert-dialog.tsx'])(
    '%s dims with bg-scrim, not raw black',
    (f) => {
      const s = src(f)
      expect(s).toMatch(/\bbg-scrim\b/)
      expect(s).not.toMatch(/bg-black\//)
    },
  )

  it('select popup is raised', () => {
    expect(src('components/ui/select.tsx')).toMatch(/\bshadow-raised\b/)
  })

  it('more-sheet backdrop is the scrim in every state', () => {
    const s = src('app/app/_components/more-sheet.tsx')
    for (const cls of ['bg-scrim', 'hover:bg-scrim', 'dark:hover:bg-scrim']) {
      expect(s).toMatch(new RegExp(`(^|[\\s"'])${cls}($|[\\s"'])`))
    }
    expect(s).not.toContain('bg-foreground/10')
  })
})

describe('opacity-as-colour is replaced by tokens', () => {
  it.each([
    'app/app/_components/question-card.tsx',
    'app/app/internal-exam/_components/available-tab.tsx',
    'app/app/quiz/_components/question-filter-toggles.tsx',
  ])('%s has no translucent muted-foreground text', (f) => {
    expect(src(f)).not.toContain('text-muted-foreground/')
  })

  it.each([
    'components/ui/table.tsx',
    'app/app/quiz/_components/subject-select.tsx',
    'app/app/admin/syllabus/_components/subtopic-row.tsx',
    'app/app/admin/syllabus/_components/topic-row.tsx',
    'app/app/admin/exam-config/_components/subject-config-card.tsx',
  ])('%s hovers to solid muted', (f) => {
    const s = src(f)
    expect(s).not.toContain('hover:bg-muted/50')
    expect(s).toContain('hover:bg-muted')
  })

  it.each([
    'components/ui/dialog.tsx',
    'components/ui/alert-dialog.tsx',
    'components/ui/card.tsx',
    'components/ui/table.tsx',
  ])('%s footer panel is solid muted', (f) => {
    const s = src(f)
    expect(s).not.toContain('bg-muted/50')
    expect(s).toMatch(/\bbg-muted\b/)
  })

  it('topic-list subtopic panel is solid muted', () => {
    const s = src('app/app/quiz/_components/topic-list.tsx')
    expect(s).not.toContain('bg-muted/40')
    expect(s).toMatch(/\bbg-muted\b/)
  })
})

describe('disabled is 50% and not-allowed', () => {
  it('the shared Input carries the disabled state for short-answer-input and dialog-blank', () => {
    const s = src('components/ui/input.tsx')
    expect(s).toContain('disabled:opacity-50')
    expect(s).toContain('disabled:cursor-not-allowed')
  })
})

describe('disabled controls', () => {
  it('button variants: no pointer events, 50% opacity', () => {
    const s = src('components/ui/button-variants.ts')
    expect(s).toContain('disabled:pointer-events-none')
    expect(s).toContain('disabled:opacity-50')
  })

  it.each(['components/ui/input.tsx', 'components/ui/select.tsx'])(
    '%s keeps pointer events',
    (f) => {
      expect(src(f)).not.toMatch(/(?<!data-)disabled:pointer-events-none/)
    },
  )
})
