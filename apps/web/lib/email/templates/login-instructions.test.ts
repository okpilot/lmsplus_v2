import { describe, expect, it } from 'vitest'
import { loginInstructionsEmail } from './login-instructions'

const BASE = {
  fullName: 'Alice Pilot',
  email: 'alice@example.com',
  tempPassword: 'Xy7hK2mPqW9r',
  expiresAt: '2026-04-29T15:30:00.000Z',
  loginUrl: 'https://app.example.com/',
}

describe('loginInstructionsEmail', () => {
  it('includes the email, temporary password, and login URL in both html and text', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    for (const value of [BASE.email, BASE.tempPassword, BASE.loginUrl]) {
      expect(html).toContain(value)
      expect(text).toContain(value)
    }
  })

  it('renders the expiry date readably in both html and text', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    // 2026-04-29 15:30 UTC, en-GB long date style.
    expect(html).toContain('29 April 2026')
    expect(text).toContain('29 April 2026')
  })

  it('greets the recipient by name when a name is present', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    expect(html).toContain('Hello Alice Pilot,')
    expect(text).toContain('Hello Alice Pilot,')
  })

  it('uses a neutral greeting when fullName is null', () => {
    const { html, text } = loginInstructionsEmail({ ...BASE, fullName: null })

    expect(html).toContain('Hello,')
    expect(html).not.toContain('Hello null')
    expect(text).toContain('Hello,')
  })

  it('states the password is temporary and must be changed on login', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    expect(html).toContain('You will be asked to choose your own password')
    expect(text).toContain('You will be asked to choose your own password')
  })

  it('has a fixed subject line', () => {
    const { subject } = loginInstructionsEmail(BASE)

    expect(subject).toBe('Your LMS Plus login details')
  })

  it('HTML-escapes DB-derived values but leaves the plain-text body raw', () => {
    const malicious = '<script>alert(1)</script> & "quotes"'
    const { html, text } = loginInstructionsEmail({
      ...BASE,
      fullName: malicious,
    })

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;')
    expect(html).not.toContain('<script>alert(1)</script>')
    // Plain text needs no escaping — the raw value is preserved.
    expect(text).toContain(malicious)
  })

  it('escapes single quotes in DB-derived values', () => {
    const { html } = loginInstructionsEmail({ ...BASE, fullName: "O'Brien" })

    expect(html).toContain('Hello O&#39;Brien,')
    expect(html).not.toContain("O'Brien")
  })

  it('passes the expiresAt string through unchanged when it is not a valid date', () => {
    const { html, text } = loginInstructionsEmail({ ...BASE, expiresAt: 'not-a-date' })

    // The private formatExpiry falls back to the raw string when new Date() returns NaN.
    expect(html).toContain('not-a-date')
    expect(text).toContain('not-a-date')
  })
})
