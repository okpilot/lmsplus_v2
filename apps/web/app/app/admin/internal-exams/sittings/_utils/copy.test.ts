import { describe, expect, it } from 'vitest'
import { closeConfirmText } from './copy'

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
