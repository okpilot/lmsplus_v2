import { describe, expect, it } from 'vitest'
import { buildCodeEmail, sittingOf } from './_code-email'
import type { InternalExamCodeForEmail } from './email-queries'

const base: InternalExamCodeForEmail = {
  code: 'ABC123',
  studentEmail: 'a@example.com',
  studentName: 'Ann',
  subjectName: 'Air Law',
  expiresAt: '2026-12-01T10:00:00.000Z',
  consumedAt: null,
  voidedAt: null,
  sittingEntryId: null,
  sittingId: null,
  scheduledAt: null,
  mode: null,
  sittingStatus: null,
}

const withSitting: InternalExamCodeForEmail = {
  ...base,
  sittingEntryId: 'e1',
  sittingId: 's1',
  scheduledAt: '2026-12-05T09:30:00.000Z',
  mode: 'remote',
  sittingStatus: 'scheduled',
}

describe('sittingOf', () => {
  it('returns null for a legacy code', () => {
    expect(sittingOf(base)).toBeNull()
  })

  it('returns the sitting fields for a sitting code', () => {
    expect(sittingOf(withSitting)).toEqual({
      scheduledAt: '2026-12-05T09:30:00.000Z',
      mode: 'remote',
      status: 'scheduled',
    })
  })

  it('returns null when one embed field is missing', () => {
    expect(sittingOf({ ...withSitting, sittingStatus: null })).toBeNull()
    expect(sittingOf({ ...withSitting, mode: null })).toBeNull()
    expect(sittingOf({ ...withSitting, scheduledAt: null })).toBeNull()
  })
})

describe('buildCodeEmail', () => {
  const url = 'https://app.example/app/internal-exam'

  it('uses the sitting template for a sitting code', () => {
    const mail = buildCodeEmail(withSitting, sittingOf(withSitting), url)
    expect(mail.subject).toContain('Air Law')
    expect(mail.text).toContain('Sitting:')
    expect(mail.text).toContain('ABC123')
    expect(mail.text).toContain(url)
  })

  it('uses the legacy template for a legacy code', () => {
    const mail = buildCodeEmail(base, null, url)
    expect(mail.text).not.toContain('Sitting:')
    expect(mail.text).toContain('ABC123')
    expect(mail.text).toContain(url)
  })
})
