import { afterEach, describe, expect, it } from 'vitest'
import { formatExpiry as adminFormatExpiry } from '@/app/app/admin/internal-exams/_utils/format-expiry'
import { formatDate as questionFormatDate } from '@/app/app/admin/questions/_components/question-table-helpers'
import { formatDate as reportsFormatDate } from '@/app/app/reports/_components/reports-utils'
import { formatExpiry as emailFormatExpiry } from '@/lib/email/format-expiry'
import { internalExamCodeEmail } from '@/lib/email/templates/internal-exam-code'

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe('call sites render UTC regardless of host TZ', () => {
  it('admin internal-exams formatExpiry renders the UTC day with a UTC label', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    const out = adminFormatExpiry('2026-03-15T23:30:00Z')
    expect(out).toContain('15 Mar 2026')
    expect(out).toMatch(/23:30 UTC$/)
  })

  it('reports-utils formatDate renders the UTC day under America/Los_Angeles', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(reportsFormatDate('2026-03-15T00:30:00Z')).toBe('15 Mar 2026')
  })

  it('reports-utils formatDate renders the UTC day under Pacific/Kiritimati', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(reportsFormatDate('2026-03-15T23:30:00Z')).toBe('15 Mar 2026')
  })

  it('question-table-helpers formatDate renders the UTC day under America/Los_Angeles', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(questionFormatDate('2026-03-15T00:30:00Z')).toBe('15 Mar 2026')
  })

  it('question-table-helpers formatDate renders the UTC day under Pacific/Kiritimati', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(questionFormatDate('2026-03-15T23:30:00Z')).toBe('15 Mar 2026')
  })
})

describe('email expiry', () => {
  it('formats with a single trailing UTC label', () => {
    expect(emailFormatExpiry('2026-04-29T15:30:00.000Z')).toBe('29 April 2026 at 15:30 UTC')
  })

  it('returns invalid input unchanged', () => {
    expect(emailFormatExpiry('not-a-date')).toBe('not-a-date')
  })

  it('internal-exam-code email shows the expiry with exactly one UTC label in html and text', () => {
    const { html, text } = internalExamCodeEmail({
      studentName: 'Alice',
      subjectName: 'Meteorology',
      code: 'ABCD2345',
      expiresAt: '2026-04-29T15:30:00.000Z',
      examUrl: 'https://app.example.com/app/internal-exam',
    })
    for (const body of [html, text]) {
      expect(body).toContain('29 April 2026 at 15:30 UTC')
      expect(body).not.toContain('(UTC)')
      expect(body).not.toContain('UTC UTC')
    }
  })
})
