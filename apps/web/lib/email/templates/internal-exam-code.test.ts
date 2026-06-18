import { describe, expect, it } from 'vitest'
import { internalExamCodeEmail } from './internal-exam-code'

const BASE = {
  studentName: 'Alice Pilot',
  subjectName: 'Meteorology',
  code: 'ABCD2345',
  expiresAt: '2026-04-29T15:30:00.000Z',
  examUrl: 'https://app.example.com/app/internal-exam',
}

describe('internalExamCodeEmail', () => {
  it('includes the code, subject name, and exam URL in both html and text', () => {
    const { html, text } = internalExamCodeEmail(BASE)

    for (const value of [BASE.code, BASE.subjectName, BASE.examUrl]) {
      expect(html).toContain(value)
      expect(text).toContain(value)
    }
  })

  it('renders the expiry date readably in both html and text', () => {
    const { html, text } = internalExamCodeEmail(BASE)

    // 2026-04-29 15:30 UTC, en-GB long date style.
    expect(html).toContain('29 April 2026')
    expect(text).toContain('29 April 2026')
  })

  it('greets the student by name when a name is present', () => {
    const { html, text } = internalExamCodeEmail(BASE)

    expect(html).toContain('Hello Alice Pilot,')
    expect(text).toContain('Hello Alice Pilot,')
  })

  it('uses a neutral greeting when studentName is null', () => {
    const { html, text } = internalExamCodeEmail({ ...BASE, studentName: null })

    expect(html).toContain('Hello,')
    expect(html).not.toContain('Hello null')
    expect(text).toContain('Hello,')
  })

  it('puts the subject name in the subject line', () => {
    const { subject } = internalExamCodeEmail(BASE)

    expect(subject).toContain(BASE.subjectName)
  })
})
