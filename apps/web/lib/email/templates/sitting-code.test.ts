import { describe, expect, it } from 'vitest'
import { sittingCodeEmail } from './sitting-code'

const BASE = {
  studentName: 'Alice Pilot',
  subjectName: 'Meteorology',
  code: 'ABCD2345',
  scheduledAt: '2026-11-24T09:00:00.000Z',
  mode: 'remote' as const,
  examUrl: 'https://app.example.com/app/internal-exam',
}

describe('sittingCodeEmail', () => {
  it('puts the subject and the UTC sitting date in the subject line', () => {
    const { subject } = sittingCodeEmail(BASE)
    expect(subject).toMatch(/^Your access code: Meteorology internal exam, /)
    expect(subject).toContain('24 Nov 2026')
    expect(subject).toMatch(/09:00 UTC$/)
  })

  it('includes code, subject, exam URL and UTC date in both html and text', () => {
    const { html, text } = sittingCodeEmail(BASE)
    for (const body of [html, text]) {
      for (const v of [BASE.code, BASE.subjectName, BASE.examUrl, '24 Nov 2026', '09:00 UTC']) {
        expect(body).toContain(v)
      }
    }
  })

  it('renders the sitting date in UTC, not the server zone', () => {
    const { text } = sittingCodeEmail({ ...BASE, scheduledAt: '2026-03-15T23:30:00.000Z' })
    expect(text).toContain('15 Mar 2026')
    expect(text).toContain('23:30 UTC')
    expect(text).not.toContain('UTC UTC')
  })

  it.each([
    ['remote', 'Remote'],
    ['in_person', 'In person'],
  ] as const)('names the mode %s as "%s"', (mode, label) => {
    const { html, text } = sittingCodeEmail({ ...BASE, mode })
    expect(html).toContain(label)
    expect(text).toContain(label)
  })

  it('states the usage rules of the code', () => {
    const { text } = sittingCodeEmail(BASE)
    expect(text).toContain('You are entered for the Meteorology internal exam.')
    expect(text).toContain('only while your invigilator has the sitting open')
    expect(text).toContain('not after the end of the sitting day (UTC)')
    expect(text).toContain('It can be used once.')
    expect(text).toContain('Keep this code to yourself.')
  })

  it('has no permitted-materials line (Decision 259)', () => {
    const { subject, html, text } = sittingCodeEmail(BASE)
    for (const s of [subject, html, text]) expect(s.toLowerCase()).not.toContain('permitted')
  })

  it('greets by name, and neutrally when the name is null', () => {
    expect(sittingCodeEmail(BASE).text).toContain('Hello Alice Pilot,')
    const { html, text } = sittingCodeEmail({ ...BASE, studentName: null })
    expect(text).toContain('Hello,')
    expect(html).not.toContain('null')
  })

  it('HTML-escapes the student name, subject and code in the html body', () => {
    const { html } = sittingCodeEmail({
      ...BASE,
      studentName: '<b>Al</b> & "Bo"',
      subjectName: '<script>x</script>',
      code: '<i>C</i>',
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Al</b>')
    expect(html).not.toContain('<i>C</i>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;Bo&quot;')
  })
})
