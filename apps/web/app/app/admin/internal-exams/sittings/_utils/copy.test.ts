import { describe, expect, it } from 'vitest'
import {
  cancelledBanner,
  closeConfirmText,
  detailsSavedBanner,
  emailCodesBanner,
  issueSkipText,
  sendNoticesBanner,
} from './copy'

const base = { attemptsRunning: 0, entriesNotStarted: 0, studentsNotStarted: 0 }

describe('closeConfirmText', () => {
  it('always ends with the cannot-reopen line', () => {
    expect(closeConfirmText(base)).toContain('A closed sitting cannot be reopened.')
  })

  it('mentions running attempts', () => {
    expect(closeConfirmText({ ...base, attemptsRunning: 2 })).toContain(
      '2 attempts running will continue to the end.',
    )
  })

  it('uses the singular for one running attempt', () => {
    expect(closeConfirmText({ ...base, attemptsRunning: 1 })).toContain(
      '1 attempt running will continue to the end.',
    )
  })

  it('mentions not-started exams marked absent with codes voided', () => {
    const t = closeConfirmText({ ...base, entriesNotStarted: 3, studentsNotStarted: 2 })
    expect(t).toContain('3 exams (2 students) have not started')
    expect(t).toContain('marked absent and their codes voided')
  })

  it('uses the singular when one exam has not started', () => {
    const t = closeConfirmText({ ...base, entriesNotStarted: 1, studentsNotStarted: 1 })
    expect(t).toContain(
      '1 exam (1 student) has not started: it will be marked absent and its code voided.',
    )
  })

  it('omits both lines when nothing is running or pending', () => {
    const t = closeConfirmText(base)
    expect(t).not.toContain('running')
    expect(t).not.toContain('not started')
  })
})

describe('issueSkipText', () => {
  const none = {
    skippedAlreadyIssued: 0,
    skippedAttemptTaken: 0,
    skippedDeactivated: 0,
    skippedNoConfig: 0,
    skippedNotEnrolled: 0,
    skippedPassed: 0,
  }

  it('is empty when nothing was skipped', () => {
    expect(issueSkipText(none)).toBe('')
  })

  it('lists every reason with a count above zero', () => {
    expect(issueSkipText({ ...none, skippedPassed: 1, skippedDeactivated: 2 })).toBe(
      'Skipped: already passed, deactivated.',
    )
  })
})

describe('emailCodesBanner', () => {
  const failed = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ studentName: `S${i}`, subjectName: 'Met' }))
  const base = { sent: 0, skipped: 0, unrecorded: 0 }

  it('lists at most 5 failures, then the remainder count', () => {
    const line = emailCodesBanner({ ...base, failed: failed(7) }).lines?.[0]
    expect(line).toBe('Failed 7: S0 (Met), S1 (Met), S2 (Met), S3 (Met), S4 (Met), and 2 more')
  })

  it('lists all failures up to 5 without a remainder', () => {
    const line = emailCodesBanner({ ...base, failed: failed(5) }).lines?.[0]
    expect(line).toBe('Failed 5: S0 (Met), S1 (Met), S2 (Met), S3 (Met), S4 (Met)')
  })

  it('states unrecorded sends without a resend hint', () => {
    expect(emailCodesBanner({ ...base, failed: [], unrecorded: 2 }).lines).toEqual([
      '2 sent but not recorded',
    ])
  })
})

describe('CANCEL_CONFIRM_TEXT notices line', () => {
  it('tells the admin that emailed students get a cancellation notice', async () => {
    const { CANCEL_CONFIRM_TEXT } = await import('./copy')
    expect(CANCEL_CONFIRM_TEXT).toContain(
      'Students who were emailed a code get a cancellation notice.',
    )
  })
})

describe('notice banners with errors', () => {
  it('cancelledBanner adds the unrecorded line', () => {
    const b = cancelledBanner(2, { sent: 1, failed: [], unrecorded: 1 })
    expect(b.tone).toBe('caution')
    expect(b.detail).toContain('1 sent but not recorded. Send notices will send them again.')
  })

  it('cancelledBanner tells the admin to use Send notices on error', () => {
    const b = cancelledBanner(2, { sent: 0, failed: [], error: true })
    expect(b.tone).toBe('caution')
    expect(b.detail).toContain('Notices could not be sent. Use Send notices.')
  })

  it('cancelledBanner stays a success without problems', () => {
    expect(cancelledBanner(2, { sent: 1, failed: [] }).tone).toBe('success')
  })

  it('detailsSavedBanner notes a change notice error', () => {
    const b = detailsSavedBanner({ sent: 0, failed: [], error: true })
    expect(b.tone).toBe('caution')
    expect(JSON.stringify(b)).toContain(
      'Change notice could not be sent. Use Resend code on their exams.',
    )
  })

  it('sendNoticesBanner notes that some notices could not be sent', () => {
    const b = sendNoticesBanner({ sent: 1, failed: [], skipped: 0, unrecorded: 0, error: true })
    expect(b.tone).toBe('caution')
    expect(b.lines).toContain('Some notices could not be sent. Try Send notices again.')
  })
})
