import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8')
const count = (text: string, token: string) => text.split(token).length - 1
const has = (text: string, re: RegExp) => re.test(text)
const cls = (name: string) =>
  new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`)

describe('spacing roles (#1673)', () => {
  it.each(['components/ui/dialog.tsx', 'components/ui/alert-dialog.tsx'])(
    '%s pads with p-dialog-pad and bleeds with -mx/-mb-dialog-pad',
    (f) => {
      const t = src(f)
      expect(t).toContain('p-dialog-pad')
      expect(t).toContain('-mx-dialog-pad')
      expect(t).toContain('-mb-dialog-pad')
      for (const raw of ['p-4', '-mx-4', '-mb-4']) expect(has(t, cls(raw))).toBe(false)
    },
  )

  it('card sm variant uses card-sm in place of every 12px class', () => {
    const t = src('components/ui/card.tsx')
    for (const c of [
      'data-[size=sm]:gap-card-sm',
      'data-[size=sm]:py-card-sm',
      'group-data-[size=sm]/card:px-card-sm',
      'group-data-[size=sm]/card:[.border-b]:pb-card-sm',
    ])
      expect(t).toContain(c)
    for (const raw of ['gap-3', 'py-3', 'px-3', 'pb-3', 'p-3'])
      expect(t).not.toMatch(
        new RegExp(`(?:data-\\[size=sm\\]|group-data-\\[size=sm\\]/card)[^'\\s]*:${raw}(?![\\w-])`),
      )
    expect(t).toContain('data-[size=sm]:has-data-[slot=card-footer]:pb-0')
  })

  it.each([
    ['app/legal/privacy/_components/privacy-policy-content.tsx', 8],
    ['app/legal/terms/page.tsx', 4],
    ['app/app/_components/markdown-text.tsx', 2],
    ['app/auth/set-password/_components/link-unavailable.tsx', 1],
  ])('%s uses pl-prose-indent x%i, no pl-5', (f, n) => {
    const t = src(f)
    expect(count(t, 'pl-prose-indent')).toBe(n)
    expect(has(t, cls('pl-5'))).toBe(false)
  })

  it.each([
    'app/_components/login-form.tsx',
    'app/app/settings/_components/change-password-form.tsx',
    'components/auth/new-password-fields.tsx',
  ])('%s reserves the field end with pr-field-end', (f) => {
    const t = src(f)
    expect(t).toContain('pr-field-end')
    expect(has(t, cls('pr-10'))).toBe(false)
  })

  it('subject-breakdown keeps its row action gutter pr-10', () => {
    expect(has(src('app/app/progress/_components/subject-breakdown.tsx'), cls('pr-10'))).toBe(true)
  })

  it.each([
    'components/ui/checkbox.tsx',
    'components/ui/radio-group.tsx',
    'components/ui/switch.tsx',
  ])('%s hit area uses -inset-x-tap-x -inset-y-tap-y', (f) => {
    const t = src(f)
    expect(t).toContain('-inset-x-tap-x')
    expect(t).toContain('-inset-y-tap-y')
    expect(t).not.toContain('-inset-x-3')
    expect(has(t, cls('after:-inset-y-2'))).toBe(false)
  })

  it('button-variants swaps only -inset-y-2 for -inset-y-tap-y, keeping -inset-x-0.5 and -inset-y-1.5', () => {
    const t = src('components/ui/button-variants.ts')
    expect(count(t, 'after:-inset-y-tap-y')).toBe(2)
    expect(has(t, cls('after:-inset-y-2'))).toBe(false)
    expect(count(t, 'after:-inset-x-0.5')).toBe(3)
    expect(t).toContain('after:-inset-y-1.5')
  })

  it('select small trigger uses -inset-y-tap-y and keeps -inset-x-0.5', () => {
    const t = src('components/ui/select.tsx')
    expect(t).toContain('data-[size=sm]:after:-inset-y-tap-y')
    expect(t).toContain('data-[size=sm]:after:-inset-x-0.5')
    expect(t).not.toContain('data-[size=sm]:after:-inset-y-2')
  })

  it('subject-config-card keeps its after:-inset-y-3 hit area', () => {
    expect(src('app/app/admin/exam-config/_components/subject-config-card.tsx')).toContain(
      'after:-inset-y-3',
    )
  })

  it('sidebar-nav uses gap-nav-gap, no gap-7', () => {
    const t = src('app/app/_components/sidebar-nav.tsx')
    expect(count(t, 'gap-nav-gap')).toBe(2)
    expect(has(t, cls('gap-7'))).toBe(false)
  })

  it('app-shell clears the tab bar with pb-tab-clear', () => {
    const t = src('app/app/_components/app-shell.tsx')
    expect(t).toContain('pb-tab-clear')
    expect(has(t, cls('pb-24'))).toBe(false)
  })

  it('quiz topic-row insets with pl-inset-lg, no pl-16', () => {
    const t = src('app/app/quiz/_components/topic-row.tsx')
    expect(t).toContain('pl-inset-lg')
    expect(has(t, cls('pl-16'))).toBe(false)
  })

  it('auth-shell caps width with max-w-auth and keeps px-4 py-8', () => {
    const t = src('components/auth/auth-shell.tsx')
    expect(t).toContain('max-w-auth')
    expect(has(t, cls('max-w-100'))).toBe(false)
    expect(has(t, cls('px-4'))).toBe(true)
    expect(has(t, cls('py-8'))).toBe(true)
  })
})
