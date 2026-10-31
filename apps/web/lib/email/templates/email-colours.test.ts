import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLOURS } from '@/lib/design/colour'
import { contrastRatio } from '@/lib/design/contrast'
import { EMAIL_COLOURS } from '@/lib/design/email-colours'
import { internalExamCodeEmail } from './internal-exam-code'
import { loginInstructionsEmail } from './login-instructions'
import { recoveryCodeEmail } from './recovery-code'

type Key = keyof typeof EMAIL_COLOURS

const RENDERED: Record<string, { html: string; keys: Key[] }> = {
  'internal-exam-code': {
    html: internalExamCodeEmail({
      studentName: 'Alice Pilot',
      subjectName: 'Meteorology',
      code: 'ABCD2345',
      expiresAt: '2026-04-29T15:30:00.000Z',
      examUrl: 'https://app.example.com/app/internal-exam',
    }).html,
    keys: ['text', 'muted', 'accent', 'on-accent', 'surface'],
  },
  'login-instructions': {
    html: loginInstructionsEmail({
      fullName: 'Alice Pilot',
      email: 'alice@example.com',
      setPasswordUrl: 'https://app.example.com/auth/set-password?token_hash=abc&type=recovery',
      loginUrl: 'https://app.example.com/',
    }).html,
    keys: ['text', 'muted', 'accent', 'on-accent'],
  },
  'recovery-code': {
    html: recoveryCodeEmail({ code: '482913' }).html,
    keys: ['text', 'muted'],
  },
}

describe('email templates colours', () => {
  for (const [name, { html, keys }] of Object.entries(RENDERED)) {
    it(`${name} renders its EMAIL_COLOURS values`, () => {
      for (const key of keys) {
        expect(html.toLowerCase(), `${name} ${key}`).toContain(EMAIL_COLOURS[key].toLowerCase())
      }
    })

    it(`${name} source has no literal hex colour`, () => {
      const src = readFileSync(join(__dirname, `${name}.ts`), 'utf8')
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    })

    it(`${name} uses no font-weight: bold (D3 max 600)`, () => {
      expect(html).not.toMatch(/font-weight:\s*(bold|700|800|900)/)
    })
  }

  it('muted text on the background meets WCAG AA 4.5:1', () => {
    expect(
      contrastRatio(COLOURS.light['muted-foreground'], COLOURS.light.background),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('on-accent text on the accent button meets WCAG AA 4.5:1', () => {
    expect(
      contrastRatio(COLOURS.light['primary-foreground'], COLOURS.light.primary),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
