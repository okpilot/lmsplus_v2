import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')

const PATCHED = [
  'app/app/_components/answer-options.tsx',
  'app/app/_components/bottom-tab-bar.tsx',
  'app/app/admin/questions/_components/bulk-actions-bar.tsx',
  'app/app/admin/internal-exams/_components/issued-code-panel.tsx',
  'app/app/quiz/_components/comments-tab.tsx',
  'app/app/quiz/_components/subject-select.tsx',
  'app/app/dashboard/_components/heatmap-cell.tsx',
  'app/app/quiz/session/_components/diagram-tap-list.tsx',
  'app/app/quiz/session/_components/diagrams/rwy-2709-runway-body.tsx',
  'components/ui/badge.tsx',
  'components/ui/button-variants.ts',
  'components/ui/checkbox.tsx',
  'components/ui/input.tsx',
  'components/ui/radio-group.tsx',
  'components/ui/select.tsx',
  'components/ui/switch.tsx',
  'components/ui/textarea.tsx',
]

const COLOUR =
  '(?:bg|text|border|ring|fill|stroke|outline|from|to|via|divide|shadow)-(?:[a-z][a-z0-9-]*)'
const SLASH_NN = new RegExp(`${COLOUR}/\\d+(?![\\w-])`, 'g')

describe('PR17 colour tokens', () => {
  it.each(PATCHED)('%s has no /NN colour class', (f) => {
    expect(read(f).match(SLASH_NN) ?? []).toEqual([])
  })

  it.each(PATCHED)('%s has no dark:*-destructive/NN class', (f) => {
    expect(read(f)).not.toMatch(/dark:[\w:[\]-]*destructive\/\d+/)
  })

  it('answer-options hovers with primary-border-hover', () => {
    expect(read('app/app/_components/answer-options.tsx')).toContain(
      'hover:border-primary-border-hover',
    )
  })

  it('bulk-actions-bar uses bg-glass', () => {
    expect(read('app/app/admin/questions/_components/bulk-actions-bar.tsx')).toContain('bg-glass')
  })

  it.each([
    'app/app/admin/internal-exams/_components/issued-code-panel.tsx',
    'app/app/quiz/_components/comments-tab.tsx',
    'app/app/quiz/_components/subject-select.tsx',
  ])('%s selects with bg-primary-soft', (f) => {
    expect(read(f)).toContain('bg-primary-soft')
  })

  it('diagram-tap-list uses diagram and selection tokens', () => {
    const s = read('app/app/quiz/session/_components/diagram-tap-list.tsx')
    expect(s).toContain('border-diagram-line')
    expect(s).toContain('ring-selected-ring')
    expect(s).toContain('border-primary-border-soft')
    expect(s).toContain('aria-pressed:ring-selected-ring')
  })

  it('runway body fills with diagram-fill', () => {
    expect(read('app/app/quiz/session/_components/diagrams/rwy-2709-runway-body.tsx')).toContain(
      'fill-diagram-fill',
    )
  })

  it('badge destructive uses danger-soft and invalid-ring', () => {
    const s = read('components/ui/badge.tsx')
    expect(s).toContain('bg-danger-soft')
    expect(s).toContain('[a]:hover:bg-danger-soft-hover')
    expect(s).toContain('ring-invalid-ring')
    expect(s).toContain('dark:hover:bg-foreground/(--state-hover)')
  })

  it('button-variants uses field-fill, invalid tokens and state-hover', () => {
    const s = read('components/ui/button-variants.ts')
    expect(s).toContain('dark:bg-field-fill')
    expect(s).toContain('dark:hover:bg-foreground/(--state-hover)')
    expect(s).toContain('aria-invalid:ring-invalid-ring')
    expect(s).toContain('aria-invalid:border-invalid-border')
    expect(s).not.toMatch(/aria-invalid:border-destructive/)
  })

  it.each([
    'components/ui/input.tsx',
    'components/ui/textarea.tsx',
    'components/ui/select.tsx',
    'components/ui/checkbox.tsx',
    'components/ui/switch.tsx',
  ])('%s uses invalid-border and invalid-ring', (f) => {
    const s = read(f)
    expect(s).toContain('aria-invalid:border-invalid-border')
    expect(s).toContain('aria-invalid:ring-invalid-ring')
    expect(s).not.toMatch(/aria-invalid:border-destructive/)
  })

  it.each([
    'components/ui/checkbox.tsx',
    'components/ui/input.tsx',
    'components/ui/radio-group.tsx',
    'components/ui/select.tsx',
    'components/ui/textarea.tsx',
  ])('%s fills with field-fill', (f) => {
    expect(read(f)).toMatch(/(^|[\s'"`])bg-field-fill(?![\w-])/)
  })

  it.each(['components/ui/input.tsx', 'components/ui/textarea.tsx'])(
    '%s disables with field-disabled',
    (f) => {
      expect(read(f)).toContain('disabled:bg-field-disabled')
    },
  )

  it('select hovers with state-hover', () => {
    expect(read('components/ui/select.tsx')).toContain('dark:hover:bg-foreground/(--state-hover)')
  })

  it('switch unchecked uses switch-off', () => {
    const s = read('components/ui/switch.tsx')
    expect(s).toContain('data-unchecked:bg-switch-off')
    expect(s).not.toContain('bg-input')
  })

  it('checkbox keeps aria-invalid:aria-checked:border-primary after the invalid border', () => {
    const s = read('components/ui/checkbox.tsx')
    const a = s.indexOf('aria-invalid:border-invalid-border')
    const b = s.indexOf('aria-invalid:aria-checked:border-primary')
    expect(a).toBeGreaterThanOrEqual(0)
    expect(b).toBeGreaterThan(a)
  })

  it('radio-group and badge keep plain aria-invalid:border-destructive', () => {
    expect(read('components/ui/radio-group.tsx')).toContain('aria-invalid:border-destructive')
    expect(read('components/ui/badge.tsx')).toContain('aria-invalid:border-destructive')
  })

  it.each(['components/ui/input.tsx', 'components/ui/textarea.tsx'])(
    '%s class string has no trailing space',
    (f) => {
      const bad = read(f)
        .split('\n')
        .filter((l) => l.includes('aria-invalid') && / ['"`],?$/.test(l))
      expect(bad).toEqual([])
    },
  )
})
