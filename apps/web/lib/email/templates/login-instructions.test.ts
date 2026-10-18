import { describe, expect, it } from 'vitest'
import { loginInstructionsEmail } from './login-instructions'

const BASE = {
  fullName: 'Alice Pilot',
  email: 'alice@example.com',
  setPasswordUrl: 'https://app.example.com/auth/set-password?token_hash=abc123&type=recovery',
  loginUrl: 'https://app.example.com/',
}

describe('loginInstructionsEmail', () => {
  it('names the account email and carries the set-password link in html and text', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    expect(html).toContain(BASE.email)
    expect(text).toContain(BASE.email)
    expect(text).toContain(BASE.setPasswordUrl)
    expect(html).toContain('token_hash=abc123&amp;type=recovery')
    expect(html).toContain('Set my password')
  })

  it('states the link works once and lasts 1 hour', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    for (const body of [html, text]) {
      expect(body).toContain('works once')
      expect(body).toContain('expires 1 hour after this email was sent')
    }
  })

  it('says asking for a new link cancels the earlier one', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    for (const body of [html, text]) {
      expect(body).toMatch(/new link makes this one stop working/i)
    }
  })

  it('walks through Forgot password step by step if the link has expired', () => {
    const { html, text } = loginInstructionsEmail(BASE)

    expect(text).toContain('If the link has expired:')
    expect(text).toContain('Click "Forgot password?".')
    expect(text).toContain('Enter the code from the email we send you.')
    expect(text).toContain('Choose a password.')
    expect(html).toContain('<ol')
    expect(html).toContain('Click &quot;Forgot password?&quot;.')
    expect(text).toContain(BASE.loginUrl)
    expect(html).toContain(BASE.loginUrl)
  })

  it('never mentions a temporary password or a digit count', () => {
    const { html, text, subject } = loginInstructionsEmail(BASE)

    for (const body of [html, text, subject]) {
      expect(body).not.toMatch(/temporary password/i)
      expect(body).not.toMatch(/\d+[- ]digit/i)
    }
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

  it('has a fixed subject line', () => {
    expect(loginInstructionsEmail(BASE).subject).toBe('Set your LMS Plus password')
  })

  it('HTML-escapes DB-derived values but leaves the plain-text body raw', () => {
    const malicious = '<script>alert(1)</script> & "quotes"'
    const { html, text } = loginInstructionsEmail({ ...BASE, fullName: malicious })

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(text).toContain(malicious)
  })

  it('escapes single quotes in DB-derived values', () => {
    const { html } = loginInstructionsEmail({ ...BASE, fullName: "O'Brien" })

    expect(html).toContain('Hello O&#39;Brien,')
    expect(html).not.toContain("O'Brien")
  })

  it('escapes a hostile email address and URL in the html body', () => {
    const { html } = loginInstructionsEmail({
      ...BASE,
      email: '"><img src=x>@e.com',
      setPasswordUrl: 'https://a.test/?x="><script>',
    })

    expect(html).not.toContain('<img src=x>')
    expect(html).not.toContain('"><script>')
  })
})
