import { describe, expect, it } from 'vitest'
import type { SubjectEligibility } from '../types'
import { subjectRowView } from './subject-state'

const row = (over: Partial<SubjectEligibility> = {}): SubjectEligibility => ({
  subjectId: 's1',
  subjectName: 'Flight Performance',
  subjectShort: 'FPM',
  courseId: 'c1',
  courseName: 'PPL',
  people: 1,
  eligible: 0,
  enteredHere: 0,
  passed: 0,
  attemptRunning: 0,
  enteredElsewhere: 0,
  notEnrolled: 0,
  deactivated: 0,
  state: null,
  attemptCount: null,
  passedAt: null,
  passedScore: null,
  elsewhereSittingId: null,
  elsewhereAt: null,
  ...over,
})

describe('subjectRowView, one person (AC 36)', () => {
  it('ticks an eligible exam with no suffix for a first attempt', () => {
    expect(subjectRowView(row({ eligible: 1, state: 'eligible', attemptCount: 0 }), false)).toEqual(
      {
        tickable: true,
        text: '',
        reasons: '',
      },
    )
  })

  it('shows Attempt N after N-1 failed attempts, still tickable', () => {
    expect(
      subjectRowView(row({ eligible: 1, state: 'eligible', attemptCount: 2 }), false),
    ).toMatchObject({
      tickable: true,
      text: 'Attempt 3',
    })
  })

  it.each([
    ['passed', { passedAt: '2026-11-01T10:00:00Z', passedScore: 82.4 }, 'Passed 1 Nov 2026 · 82%'],
    ['passed', {}, 'Passed'],
    [
      'entered_elsewhere',
      { elsewhereAt: '2026-11-18T09:30:00Z' },
      'In sitting 18 Nov 2026, 09:30 UTC',
    ],
    ['entered_elsewhere', {}, 'In another sitting'],
    ['attempt_running', {}, 'Attempt running'],
    ['not_enrolled', {}, 'Not enrolled'],
    ['entered_here', {}, 'Already in this sitting'],
    ['deactivated', {}, 'Deactivated'],
  ])('blocks %s with text and no checkbox', (state, extra, text) => {
    expect(subjectRowView(row({ state, ...extra }), false)).toEqual({
      tickable: false,
      text,
      reasons: '',
    })
  })

  it('never ticks anything for a deactivated person', () => {
    expect(
      subjectRowView(row({ eligible: 1, state: 'eligible', attemptCount: 0 }), true).tickable,
    ).toBe(false)
  })
})

describe('subjectRowView, several people (AC 37)', () => {
  it('says n of m can sit with the reasons for the rest', () => {
    const v = subjectRowView(
      row({ people: 6, eligible: 2, passed: 1, notEnrolled: 2, enteredElsewhere: 1 }),
      false,
    )
    expect(v).toEqual({
      tickable: true,
      text: '2 of 6 can sit',
      reasons: '1 passed, 1 in another sitting, 2 not enrolled',
    })
  })

  it('lists every reason in a fixed order', () => {
    const v = subjectRowView(
      row({
        people: 9,
        eligible: 1,
        enteredHere: 1,
        attemptRunning: 1,
        deactivated: 1,
        passed: 1,
        notEnrolled: 1,
        enteredElsewhere: 3,
      }),
      false,
    )
    expect(v.reasons).toBe(
      '1 already in this sitting, 1 passed, 1 attempt running, 3 in another sitting, 1 not enrolled, 1 deactivated',
    )
  })

  it('has no checkbox when nobody can sit', () => {
    expect(subjectRowView(row({ people: 3, eligible: 0, notEnrolled: 3 }), false)).toEqual({
      tickable: false,
      text: '0 of 3 can sit',
      reasons: '3 not enrolled',
    })
  })

  it('has no reason line when everybody can sit', () => {
    expect(subjectRowView(row({ people: 3, eligible: 3 }), false).reasons).toBe('')
  })
})
