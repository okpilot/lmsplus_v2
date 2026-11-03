import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const REPO = path.resolve(ROOT, '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const LOGIN = 'app/_components/login-form.tsx'
const FORGOT = 'app/auth/forgot-password/_components/forgot-password-form.tsx'
const RECOVERY = 'app/auth/forgot-password/_components/recovery-code-form.tsx'
const RESET = 'app/auth/reset-password/_components/reset-password-form.tsx'
const SUCCESS = 'app/auth/reset-password/_components/reset-success.tsx'
const UNAVAIL = 'app/auth/set-password/_components/link-unavailable.tsx'
const CONSENT = 'app/consent/_components/consent-checkbox.tsx'
const LINK_FILES = [LOGIN, FORGOT, RECOVERY, RESET, SUCCESS, UNAVAIL, CONSENT]

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('S3 AC 3 underline links use ui/link', () => {
  it.each(LINK_FILES)('%s has no hand-rolled underline className', (f) => {
    expect(src(f)).not.toMatch(/className="underline/)
  })
  it.each([
    [LOGIN, 3, 'muted', 1],
    [LOGIN, 3, 'inherit', 2],
    [FORGOT, 3, 'muted', 1],
    [FORGOT, 3, 'inherit', 2],
    [RECOVERY, 1, 'muted', 1],
    [RESET, 2, 'primary', 1],
    [RESET, 2, 'muted', 1],
    [SUCCESS, 1, 'primary', 1],
    [UNAVAIL, 2, 'primary', 1],
    [UNAVAIL, 2, 'muted', 1],
    [CONSENT, 1, 'inherit', 1],
  ])('%s: %i Links, tone %s x%i', (f, total, tone, n) => {
    const s = src(f)
    expect(s).toMatch(/from '@\/components\/ui\/link'/)
    expect(count(s, /<Link\b/g)).toBe(total)
    expect(count(s, new RegExp(`tone="${tone}"`, 'g'))).toBe(n)
  })
  it('consent link keeps new-tab attributes', () => {
    const s = src(CONSENT)
    expect(s).toContain('target="_blank"')
    expect(s).toContain('rel="noopener noreferrer"')
    expect(s).toContain('onClick')
  })
})

describe('S3 AC 1 headings use Heading', () => {
  it.each([
    ['components/auth/auth-shell.tsx', 1, 0],
    ['app/global-error.tsx', 1, 0],
    ['app/legal/terms/page.tsx', 1, 8],
    ['app/legal/privacy/_components/privacy-policy-content.tsx', 1, 10],
  ])('%s uses Heading level 1 and %i h2', (f, h1, h2) => {
    const s = src(f)
    expect(s).not.toMatch(/<h[123][\s>]/)
    expect(count(s, /<Heading level=\{1\}/g)).toBe(h1)
    expect(count(s, /<Heading level=\{2\}/g)).toBe(h2)
  })
  it('privacy h3s are Heading level 3', () => {
    expect(
      count(
        src('app/legal/privacy/_components/privacy-policy-content.tsx'),
        /<Heading level=\{3\}/g,
      ),
    ).toBe(5)
  })
  it('global-error asserts Heading level 1 (replaces literal text-title)', () => {
    expect(src('app/global-error.tsx')).toContain('<Heading level={1}')
  })
})

describe('S3 3a numeric fields use Input', () => {
  it('num-field uses Input and no inputCls', () => {
    const s = src('app/app/admin/exam-config/_components/num-field.tsx')
    expect(s).toMatch(/<Input\b/)
    expect(s).not.toContain('inputCls')
    expect(s).not.toMatch(/<input\b/)
  })
  it('distribution-editor uses a small right-aligned Input', () => {
    const s = src('app/app/admin/exam-config/_components/distribution-editor.tsx')
    expect(s).toMatch(/<Input[^>]*size="sm"/)
    expect(s).not.toMatch(/<input\b/)
  })
})

describe('S3 AC 5 biome forbids raw input and headings', () => {
  const biome = readFileSync(path.join(REPO, 'biome.json'), 'utf8')
  const cfg = JSON.parse(biome) as {
    linter: {
      rules: {
        correctness: { noRestrictedElements: { options: { elements: Record<string, string> } } }
      }
    }
    overrides: {
      includes: string[]
      linter?: { rules?: { correctness?: { noRestrictedElements?: string } } }
    }[]
  }
  it('elements has button, input, h1, h2, h3', () => {
    const els = cfg.linter.rules.correctness.noRestrictedElements.options.elements
    expect(Object.keys(els)).toEqual(expect.arrayContaining(['button', 'input', 'h1', 'h2', 'h3']))
    expect(els.input).toBe('Use Input from @/components/ui/input.')
    for (const h of ['h1', 'h2', 'h3'])
      expect(els[h]).toBe('Use Heading from @/components/ui/heading.')
  })
})
