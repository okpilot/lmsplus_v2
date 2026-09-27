import { describe, expect, it } from 'vitest'
import { recoveryCodeEmail } from './recovery-code'

describe('recoveryCodeEmail', () => {
  it('includes the code in both html and text', () => {
    const { html, text } = recoveryCodeEmail({ code: '482913' })

    expect(html).toContain('482913')
    expect(text).toContain('482913')
  })

  it('states the code expires in 1 hour', () => {
    const { html, text } = recoveryCodeEmail({ code: '482913' })

    expect(html).toContain('expires in 1 hour')
    expect(text).toContain('expires in 1 hour')
  })

  it('tells the recipient to ignore the email if they did not request it', () => {
    const { html, text } = recoveryCodeEmail({ code: '482913' })

    expect(html).toContain('If you did not ask to reset your password')
    expect(text).toContain('If you did not ask to reset your password')
  })

  it('never includes a clickable link', () => {
    const { html, text } = recoveryCodeEmail({ code: '482913' })

    expect(html).not.toContain('<a href')
    expect(text).not.toContain('http')
  })

  it('has a fixed subject line', () => {
    const { subject } = recoveryCodeEmail({ code: '482913' })

    expect(subject).toBe('Your LMS Plus password reset code')
  })

  it('HTML-escapes the code but leaves the plain-text body raw', () => {
    const malicious = '<script>alert(1)</script>'
    const { html, text } = recoveryCodeEmail({ code: malicious })

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(text).toContain(malicious)
  })
})
