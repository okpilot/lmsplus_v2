import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = path.resolve(ROOT, '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const has = (rel: string) => existsSync(path.join(ROOT, rel))
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '.next') walk(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}
const tree = (rel: string) => walk(path.join(ROOT, rel))
const grep = (rel: string, needle: string | RegExp) =>
  tree(rel).filter((f) => {
    const t = readFileSync(f, 'utf8')
    return typeof needle === 'string' ? t.includes(needle) : needle.test(t)
  })

const U = 'components/ui/'
const A = 'app/app/'
const Q = `${A}quiz/`
const S = `${Q}session/_components/`

describe('app shell (AC 3, 4)', () => {
  it('content area uses gutter padding and content width', () => {
    const s = src(`${A}_components/app-shell.tsx`)
    expect(s).toContain('px-gutter')
    expect(s).toContain('max-w-content')
    expect(s).not.toContain('max-w-6xl')
  })
  it('the sidebar shows, and the phone bars hide, from sm', () => {
    const shell = src(`${A}_components/app-shell.tsx`)
    expect(shell).toMatch(/sm:flex/)
    expect(shell).not.toMatch(/\bmd:/)
    expect(src(`${A}_components/phone-top-bar.tsx`)).toContain('sm:hidden')
    expect(src(`${A}_components/bottom-tab-bar.tsx`)).toContain('sm:hidden')
    expect(src(`${A}_components/more-sheet.tsx`)).not.toMatch(/\bmd:/)
  })
  it('sidebar icons are size-icon-nav and tab-bar icons size-icon-lg', () => {
    expect(src(`${A}_components/sidebar-item.tsx`)).toContain('size-icon-nav')
    expect(src(`${A}_components/nav-icon.tsx`)).toContain('size-icon-lg')
  })
})

describe('primitives (AC 5, 6)', () => {
  it('button: round size is rounded-pill, segment size is rounded-inner', () => {
    const s = src(`${U}button-variants.ts`)
    expect(s).toContain('rounded-pill')
    expect(s).not.toContain('rounded-full')
    expect(s).toMatch(/segment:\s*['"`][^'"`]*rounded-inner/)
    expect(s).toContain('size-icon')
  })
  it('badge is rounded-pill with a size-icon-sm icon and no important', () => {
    const s = src(`${U}badge.tsx`)
    expect(s).toContain('rounded-pill')
    expect(s).toContain('size-icon-sm')
    expect(s).not.toMatch(/size-[\w.-]+!/)
  })
  it('checkbox is rounded-inner', () => {
    expect(src(`${U}checkbox.tsx`)).toContain('rounded-inner')
  })
  it('dialog and alert-dialog are rounded-sheet', () => {
    expect(src(`${U}dialog.tsx`)).toContain('rounded-sheet')
    expect(src(`${U}alert-dialog.tsx`)).toContain('rounded-sheet')
  })
  it('table head and cell are px-cell-x py-cell-y', () => {
    const s = src(`${U}table.tsx`)
    expect(s.match(/px-cell-x py-cell-y/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
  it('CardListRow is px-card py-row', () => {
    const s = src(`${U}card.tsx`)
    expect(s).toContain('CardListRow')
    expect(s).toContain('px-card py-row')
  })
  it('tabs trigger is rounded-inner and question tabs carry no radius override', () => {
    expect(src(`${U}tabs.tsx`)).toContain('rounded-inner')
    expect(src(`${Q}_components/question-tabs.tsx`)).not.toContain('rounded-[')
  })
})

describe('quiz setup (AC 7)', () => {
  const form = src(`${Q}_components/quiz-config-form.tsx`)
  it('is a two-column grid at lg with a sticky first column', () => {
    expect(form).toContain('lg:grid-cols-(--layout-setup)')
    expect(form).toContain('lg:sticky')
  })
  it('Start is full width and DOM order is settings, topics, Start', () => {
    expect(src(`${Q}_components/start-button.tsx`) + form).toContain('w-full')
    const at = (s: string) => form.indexOf(s)
    const order = ['<Card>', '<TopicTree', '<StartButton'].map(at)
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('the quiz page tabs no longer narrow the page', () => {
    expect(src(`${Q}_components/quiz-page-tabs.tsx`)).not.toContain('max-w-xl')
  })
})

describe('saved quizzes (AC 8)', () => {
  it('render as rows of one list, Resume outline, no primary button per row', () => {
    const files = ['saved-draft-card', 'saved-session-card'].map((f) =>
      src(`${Q}_components/${f}.tsx`),
    )
    for (const s of files) {
      expect(s).toContain('CardListRow')
      expect(s).toContain('lg:grid-cols-(--layout-saved-row)')
      expect(s).toMatch(/variant="outline"/)
      expect(s).not.toMatch(/<Card[\s>]/)
    }
  })
})

describe('resume banners (AC 9)', () => {
  for (const f of ['active-practice-banner', 'resume-exam-banner']) {
    it(`${f} has no max-w-md and uses the row layout`, () => {
      const s = src(`${Q}_components/${f}.tsx`)
      expect(s).not.toContain('max-w-md')
      expect(s).toContain('layout="row"')
    })
  }
  it('Alert has a row layout variant', () => {
    expect(src(`${U}alert.tsx`)).toMatch(/layout/)
  })
})

describe('VFR RT setup (AC 10)', () => {
  it('practice mode is the same two-column split', () => {
    const s = grep(`${A}vfr-rt`, 'lg:grid-cols-(--layout-setup)')
    expect(s.length).toBeGreaterThan(0)
    expect(src(`${A}vfr-rt/page.tsx`)).not.toMatch(/max-w-(xl|2xl|md|lg)/)
  })
})

describe('quiz session (AC 11)', () => {
  const sessionFiles = tree(`${Q}session`).filter((f) => !f.includes('node_modules'))
  const all = [...sessionFiles, ...tree(`${A}_components`), ...tree(`${Q}_components`)]
  const text = all.map((f) => readFileSync(f, 'utf8')).join('\n')

  it('a: one Submit Answer button; the in-component and mobile footer variants are gone', () => {
    const ao = src(`${A}_components/answer-options.tsx`)
    expect(ao).not.toContain('submit-answer-mobile')
    expect(ao).not.toMatch(/hidden w-full md:block/)
    expect(text).not.toContain('submit-answer-mobile')
    expect(text).toContain('Submit Answer')
    expect(text).toContain('Confirm Answer')
  })
  it('b: Previous is a ghost button', () => {
    expect(src(`${S}quiz-nav-bar.tsx`)).toContain('variant="ghost"')
  })
  it('c: Flag and Pin are icon toggles with constant names and aria-pressed', () => {
    expect(text).toContain('Flag question')
    expect(text).toContain('Pin question')
    expect(text).toContain('aria-pressed')
    expect(text).not.toMatch(/['"`>]Unflag/)
  })
  it('d: the counter and code live in the question card top row', () => {
    const f = grep(`${Q}session`, 'Flag question')[0]
    expect(f).toBeDefined()
    const t = readFileSync(f as string, 'utf8')
    expect(t).toMatch(/Question \{?[^}]*\}? of/)
    expect(t.indexOf('Flag question')).toBeLessThan(t.indexOf('Pin question'))
  })
  it('e: header names the mode and subject; no uppercase exam badge; Finish is outline', () => {
    const h = src(`${S}quiz-session-header.tsx`) + src(`${S}quiz-session-header-parts.tsx`)
    expect(h).toContain('MODE_LABELS')
    expect(text).not.toContain('ExamBadge')
    expect(h).not.toContain('uppercase')
    expect(h).toContain('variant="outline"')
  })
  it('f: no fixed bottom bar, no meta row, no desktop grid toggle', () => {
    expect(has(`${S}quiz-session-footer.tsx`)).toBe(false)
    expect(has(`${S}quiz-session-meta-row.tsx`)).toBe(false)
    expect(text).not.toContain('grid-toggle-desktop')
    expect(text).not.toContain('Show all')
  })
  it('g: layout is the session grid and DOM order is question column then panel', () => {
    const f = grep(`${Q}session`, 'lg:grid-cols-(--layout-session)')[0]
    expect(f).toBeDefined()
    const t = readFileSync(f as string, 'utf8')
    expect(t.indexOf('lg:col-start-2')).toBeGreaterThanOrEqual(0)
    expect(t.indexOf('lg:col-start-2')).toBeLessThan(t.indexOf('lg:col-start-3'))
    expect(t).toContain('lg:w-rail')
    expect(t).toContain('max-h-(--panel-max)')
    expect(t).toContain('lg:top-(--session-header-h)')
  })
})

describe('settings (AC 12)', () => {
  it('Profile and Your Data share a band; name and password sit side by side', () => {
    const s = src(`${A}settings/_components/settings-content.tsx`)
    expect(s.match(/lg:grid-cols-2/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
  it('Quiz Statistics is gone', () => {
    expect(src(`${A}settings/_components/profile-card.tsx`)).not.toContain('Quiz Statistics')
    expect(has('lib/queries/profile.ts') ? src('lib/queries/profile.ts') : '').not.toContain(
      'getProfileStats',
    )
  })
  it('inputs are max-w-field', () => {
    const f = ['edit-name-form', 'change-password-form'].map((n) =>
      src(`${A}settings/_components/${n}.tsx`),
    )
    for (const s of f) expect(s).toContain('max-w-field')
  })
})

describe('legal and consent (AC 13)', () => {
  it('legal is one reading-width card, no prose', () => {
    const s = src('app/legal/layout.tsx')
    expect(s).not.toMatch(/\bprose\b/)
    expect(s).toContain('max-w-reading')
  })
  it('consent card is max-w-reading', () => {
    const s = src('app/consent/page.tsx')
    expect(s).toContain('max-w-reading')
    expect(s).not.toContain('max-w-lg')
  })
})

describe('decision ledger (AC 14)', () => {
  it('has Decision 188', () => {
    const d = readFileSync(path.join(REPO, 'docs/decisions.md'), 'utf8')
    expect(d).toMatch(/^## 188 — 2026-10-29 — Layout:/m)
  })
})
