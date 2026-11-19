import { describe, expect, it } from 'vitest'
import { entryRemovedEmail, sittingCancelledEmail, sittingChangedEmail } from './sitting-notice'

const CHANGED = {
  studentName: 'Alice Pilot',
  subjects: ['Meteorology', 'Navigation'],
  oldAt: '2026-11-24T09:00:00.000Z',
  newAt: '2026-11-25T13:30:00.000Z',
  oldMode: 'remote' as const,
  newMode: 'remote' as const,
  examUrl: 'https://app.example.com/app/internal-exam',
}

describe('sittingChangedEmail', () => {
  it('puts the old UTC date in the subject line', () => {
    const { subject } = sittingChangedEmail(CHANGED)
    expect(subject).toMatch(/^Change to your internal exam sitting on /)
    expect(subject).toContain('24 Nov 2026')
  })

  it('lists every subject, the new and old time in UTC, and the exam URL', () => {
    const { html, text } = sittingChangedEmail(CHANGED)
    for (const body of [html, text]) {
      for (const v of ['Meteorology', 'Navigation', '25 Nov 2026', '13:30 UTC', '24 Nov 2026']) {
        expect(body).toContain(v)
      }
      expect(body).toContain(CHANGED.examUrl)
    }
    expect(text).toContain('Your access codes stay the same.')
    expect(text).not.toContain('UTC UTC')
  })

  it('omits the mode line when only the time changed', () => {
    const { text } = sittingChangedEmail(CHANGED)
    expect(text).not.toContain('Mode:')
  })

  it('omits the time line and states the mode change when only the mode changed', () => {
    const { text } = sittingChangedEmail({
      ...CHANGED,
      newAt: CHANGED.oldAt,
      newMode: 'in_person',
    })
    expect(text).not.toContain('New time:')
    expect(text).toContain('Mode: In person (was Remote)')
  })

  it('states both lines when time and mode changed', () => {
    const { text } = sittingChangedEmail({ ...CHANGED, newMode: 'in_person' })
    expect(text).toContain('New time:')
    expect(text).toContain('Mode: In person (was Remote)')
  })

  it('renders in UTC, not the server zone', () => {
    const { text } = sittingChangedEmail({ ...CHANGED, newAt: '2026-03-15T23:30:00.000Z' })
    expect(text).toContain('15 Mar 2026')
    expect(text).toContain('23:30 UTC')
  })

  it('HTML-escapes name and subjects', () => {
    const { html } = sittingChangedEmail({
      ...CHANGED,
      studentName: '<b>Al</b>',
      subjects: ['<script>x</script>'],
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>Al</b>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('sittingCancelledEmail', () => {
  const BASE = {
    studentName: 'Alice Pilot',
    subjects: ['Meteorology', 'Navigation'],
    scheduledAt: '2026-11-24T09:00:00.000Z',
  }

  it('names the cancelled sitting date in the subject', () => {
    const { subject } = sittingCancelledEmail(BASE)
    expect(subject).toMatch(/^Cancelled: your internal exam sitting on /)
    expect(subject).toContain('24 Nov 2026')
  })

  it('states the cancellation, that codes stop working, and the next step', () => {
    const { html, text } = sittingCancelledEmail(BASE)
    for (const body of [html, text]) {
      expect(body).toContain('Meteorology')
      expect(body).toContain('Navigation')
      expect(body).toContain('has been cancelled')
      expect(body).toContain('Your access codes no longer work.')
      expect(body).toContain('Your school will arrange a new sitting.')
    }
  })

  it('never contains a code value or a Go to exam link', () => {
    const { text } = sittingCancelledEmail(BASE)
    expect(text).not.toContain('Go to exam')
  })

  it('HTML-escapes the subjects', () => {
    const { html } = sittingCancelledEmail({ ...BASE, subjects: ['<i>x</i>'] })
    expect(html).not.toContain('<i>x</i>')
  })
})

describe('entryRemovedEmail', () => {
  const BASE = {
    studentName: 'Alice Pilot',
    subjectName: 'Meteorology',
    passedAt: '2026-11-20T08:15:00.000Z',
    scheduledAt: '2026-11-24T09:00:00.000Z',
  }

  it('names the subject in the subject line', () => {
    expect(entryRemovedEmail(BASE).subject).toBe('Removed from internal exam sitting: Meteorology')
  })

  it('states the pass date, the sitting date and that the code no longer works', () => {
    const { html, text } = entryRemovedEmail(BASE)
    for (const body of [html, text]) {
      expect(body).toContain('You passed the Meteorology internal exam on')
      expect(body).toContain('20 Nov 2026')
      expect(body).toContain('you have been removed from the sitting on')
      expect(body).toContain('24 Nov 2026')
      expect(body).toContain('Your access code for it no longer works.')
    }
  })

  it('greets neutrally when the name is null and escapes the subject', () => {
    const { html, text } = entryRemovedEmail({
      ...BASE,
      studentName: null as never,
      subjectName: '<b>M</b>',
    })
    expect(text).toContain('Hello,')
    expect(html).not.toContain('null')
    expect(html).not.toContain('<b>M</b>')
  })
})
