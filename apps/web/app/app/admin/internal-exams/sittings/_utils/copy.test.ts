import { describe, expect, it } from 'vitest'
import { closeConfirmText, emailCodesBanner, issueSkipText } from './copy'

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
