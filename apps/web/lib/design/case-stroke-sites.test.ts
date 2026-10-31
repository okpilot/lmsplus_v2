import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildTokensCss } from './build-tokens-css'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const CLASS = (c: string) => new RegExp(`(^|[\\s"'\`:])${c}(?![\\w-])`)

const compile = async (): Promise<string> => {
  const twPath = createRequire(import.meta.url).resolve('@tailwindcss/postcss')
  const req = createRequire(twPath)
  const postcss = req('postcss')
  const tw = req(twPath)
  const r = await postcss([(tw.default ?? tw)()]).process(
    '@import "tailwindcss"; @import "./tokens.css"; @source inline("text-overline md:text-overline text-chip stroke-icon stroke-icon-bold");',
    { from: path.join(ROOT, 'app/probe.css') },
  )
  return r.css as string
}
const block = (css: string, sel: string) => {
  const m = css.match(new RegExp(`${sel.replace(/[.:\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  expect(m, `${sel} rule`).not.toBeNull()
  return m?.[1] ?? ''
}

describe('overline utility carries uppercase', () => {
  it('build-tokens-css declares @utility text-overline with text-transform uppercase', () => {
    expect(buildTokensCss()).toMatch(/@utility text-overline\s*\{[^}]*text-transform:\s*uppercase/)
  })

  it('committed tokens.css matches the generator', () => {
    expect(src('app/tokens.css')).toBe(buildTokensCss())
  })

  describe('compiled CSS', () => {
    let css = ''
    beforeAll(async () => {
      css = await compile()
    })

    it('.text-overline has text-transform: uppercase and keeps the overline font-size', () => {
      const b = block(css, '.text-overline')
      expect(b).toMatch(/text-transform:\s*uppercase/)
      expect(b).toContain('font-size: var(--text-overline)')
    })

    it('.text-chip is not uppercased', () => {
      expect(block(css, '.text-chip')).not.toMatch(/text-transform/)
    })

    it('.stroke-icon sets stroke-width from the icon token', () => {
      expect(block(css, '.stroke-icon').replace(/\s/g, '')).toBe(
        'stroke-width:var(--stroke-width-icon);',
      )
    })

    it('.stroke-icon-bold sets stroke-width from the bold token', () => {
      expect(block(css, '.stroke-icon-bold').replace(/\s/g, '')).toBe(
        'stroke-width:var(--stroke-width-icon-bold);',
      )
    })
  })
})

describe('heading.tsx no longer sets uppercase itself', () => {
  it('has no uppercase class', () => {
    expect(src('components/ui/heading.tsx')).not.toMatch(CLASS('uppercase'))
  })
})

describe('chip sites use text-chip', () => {
  it.each([
    'components/ui/badge.tsx',
    'components/kit/code-chip.tsx',
    'app/app/_components/user-chip.tsx',
    'app/app/quiz/_components/comments-tab.tsx',
    'app/app/quiz/session/_components/keyboard-legend.tsx',
    'app/app/dashboard/_components/heatmap-cell.tsx',
  ])('%s has text-chip and no base text-overline', (f) => {
    const s = src(f)
    expect(s).toMatch(CLASS('text-chip'))
    expect(s).not.toMatch(CLASS('text-overline'))
  })

  it.each(['app/app/_components/user-chip.tsx', 'app/app/quiz/_components/comments-tab.tsx'])(
    '%s keeps font-semibold',
    (f) => {
      expect(src(f)).toMatch(CLASS('font-semibold'))
    },
  )

  it('heatmap-cell keeps md:text-overline', () => {
    expect(src('app/app/dashboard/_components/heatmap-cell.tsx')).toMatch(CLASS('md:text-overline'))
  })

  it('info-tooltip stays text-overline', () => {
    expect(src('app/app/dashboard/_components/info-tooltip.tsx')).toMatch(CLASS('text-overline'))
  })
})

describe('icon strokes use classes, not strokeWidth', () => {
  it.each([
    ['app/app/quiz/report/_components/report-question-row.tsx', 'stroke-icon-bold'],
    ['app/app/_components/nav-icon.tsx', 'stroke-icon'],
    ['app/app/_components/sidebar-item.tsx', 'stroke-icon'],
    ['app/app/_components/theme-toggle.tsx', 'stroke-icon'],
    ['app/app/admin/syllabus/_components/subject-row.tsx', 'stroke-icon'],
    ['app/app/admin/syllabus/_components/topic-row.tsx', 'stroke-icon'],
    ['app/app/admin/syllabus/_components/subtopic-row.tsx', 'stroke-icon'],
  ])('%s drops strokeWidth and carries %s', (f, cls) => {
    const s = src(f)
    expect(s).not.toContain('strokeWidth')
    expect(s).toMatch(CLASS(cls))
  })
})
