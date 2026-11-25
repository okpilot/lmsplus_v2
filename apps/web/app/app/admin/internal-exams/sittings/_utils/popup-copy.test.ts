import { describe, expect, it } from 'vitest'
import {
  addExamsBanner,
  addPeopleBanner,
  groupAddLabel,
  ISSUE_SKIP_LABEL,
  issuePopupBanner,
  issuePreviewLine,
  sameDayText,
  skipReasonText,
  tooManyPairsText,
} from './popup-copy'

describe('addPeopleBanner (AC 33)', () => {
  it('says Added n people with no skipped clause when nothing was skipped', () => {
    expect(addPeopleBanner({ added: 2, skippedExisting: 0, skippedDeactivated: 0 })).toEqual({
      tone: 'success',
      title: 'Added 2 people.',
    })
    expect(addPeopleBanner({ added: 1, skippedExisting: 0, skippedDeactivated: 0 }).title).toBe(
      'Added 1 person.',
    )
  })

  it('adds a Skipped clause listing only the non-zero reasons', () => {
    expect(addPeopleBanner({ added: 2, skippedExisting: 0, skippedDeactivated: 3 }).detail).toBe(
      'Skipped: 3 deactivated.',
    )
    expect(addPeopleBanner({ added: 2, skippedExisting: 1, skippedDeactivated: 3 }).detail).toBe(
      'Skipped: 1 already in this sitting; 3 deactivated.',
    )
  })

  it('uses the caution tone when nobody was added', () => {
    expect(addPeopleBanner({ added: 0, skippedExisting: 2, skippedDeactivated: 0 }).tone).toBe(
      'caution',
    )
  })
})

describe('groupAddLabel (AC 34)', () => {
  it('shows both counts', () => {
    expect(groupAddLabel('Class A', 4, 1)).toBe(
      'Add whole group "Class A" (4 new, 1 deactivated skipped)',
    )
  })
  it('omits zero clauses', () => {
    expect(groupAddLabel('Class A', 4, 0)).toBe('Add whole group "Class A" (4 new)')
    expect(groupAddLabel('Class A', 0, 2)).toBe('Add whole group "Class A" (2 deactivated skipped)')
    expect(groupAddLabel('Class A', 0, 0)).toBe('Add whole group "Class A"')
  })
})

describe('skipReasonText (B6)', () => {
  it.each([
    ['existing', undefined, 'already in this sitting'],
    ['not_candidate', undefined, 'not in this sitting'],
    ['deactivated', undefined, 'deactivated'],
    ['not_enrolled', undefined, 'not enrolled'],
    ['attempt_running', undefined, 'attempt running'],
    ['passed', undefined, 'already passed'],
    ['passed', '2026-11-01T10:00:00Z', 'already passed on 1 Nov 2026 UTC'],
    ['entered_elsewhere', '2026-11-18T09:30:00Z', 'in another sitting on 18 Nov 2026, 09:30 UTC'],
    ['entered_elsewhere', undefined, 'in another sitting'],
    ['something_new', undefined, 'skipped'],
  ])('maps %s (%s)', (reason, at, text) => {
    expect(skipReasonText(reason, at)).toBe(text)
  })
})

describe('addExamsBanner (AC 39)', () => {
  const short = (id: string) => (id === 's1' ? 'FPM' : 'NAV')

  it('is a success with no lines when nothing was skipped', () => {
    expect(addExamsBanner({ added: 1, skippedTotal: 0, skipped: [] }, short)).toEqual({
      tone: 'success',
      title: 'Added 1 exam.',
    })
  })

  it('lists skips as person · short: reason with the caution tone', () => {
    const b = addExamsBanner(
      {
        added: 2,
        skippedTotal: 2,
        skipped: [
          { person: 'Ann', subjectId: 's1', reason: 'not_enrolled' },
          { person: 'Bob', subjectId: 's2', reason: 'passed', detailAt: '2026-11-01T10:00:00Z' },
        ],
      },
      short,
    )
    expect(b).toEqual({
      tone: 'caution',
      title: 'Added 2 exams.',
      detail: 'Skipped 2 exams:',
      lines: ['Ann · FPM: not enrolled', 'Bob · NAV: already passed on 1 Nov 2026 UTC'],
    })
  })

  it('says how many are listed when the RPC capped the list', () => {
    const skipped = [{ person: 'Ann', subjectId: 's1', reason: 'existing' }]
    const b = addExamsBanner({ added: 0, skippedTotal: 120, skipped }, short)
    expect(b.detail).toBe('Skipped 120 exams. The first 1 are listed:')
  })

  it('falls back to a dash when the subject short is unknown', () => {
    const b = addExamsBanner(
      {
        added: 0,
        skippedTotal: 1,
        skipped: [{ person: 'Ann', subjectId: 'zz', reason: 'existing' }],
      },
      () => undefined,
    )
    expect(b.lines).toEqual(['Ann · -: already in this sitting'])
  })
})

describe('sameDayText (AC 40)', () => {
  const p = (name: string, at = '2026-11-18T09:30:00Z') => ({ name, scheduledAt: at })
  it('uses is for one person and are for several', () => {
    expect(sameDayText([p('Ann')])).toBe('Ann is also in another sitting that day (09:30 UTC).')
    expect(sameDayText([p('Ann'), p('Bob')])).toBe(
      'Ann and Bob are also in another sitting that day (09:30 UTC).',
    )
  })
  it('joins three names with a comma and and', () => {
    expect(sameDayText(['A', 'B', 'C'].map((n) => p(n)))).toBe(
      'A, B and C are also in another sitting that day (09:30 UTC).',
    )
  })
  it('names three then and r more', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map((n) => p(n))
    expect(sameDayText(many)).toBe(
      'A, B, C and 2 more are also in another sitting that day (09:30 UTC).',
    )
  })
  it('gives no time when the people sit at different times', () => {
    expect(sameDayText([p('Ann', '2026-11-18T14:00:00Z'), p('Bob', '2026-11-18T09:30:00Z')])).toBe(
      'Ann and Bob are also in another sitting that day.',
    )
  })
  it('is empty for nobody', () => {
    expect(sameDayText([])).toBe('')
  })
})

describe('tooManyPairsText (AC 38)', () => {
  it('names people, exams and the product', () => {
    expect(tooManyPairsText(250, 5)).toBe(
      'Too many: 250 people x 5 exams = 1250; the limit is 1000. Untick exams.',
    )
    expect(tooManyPairsText(1, 1001)).toBe(
      'Too many: 1 person x 1001 exams = 1001; the limit is 1000. Untick exams.',
    )
  })
})

describe('issue copy (AC 42, 43)', () => {
  it('previews codes and students', () => {
    expect(issuePreviewLine(1, 1)).toBe('Will issue 1 code for 1 student.')
    expect(issuePreviewLine(3, 2)).toBe('Will issue 3 codes for 2 students.')
  })

  it('labels every plan skip reason', () => {
    expect(ISSUE_SKIP_LABEL).toEqual({
      attempt_taken: 'attempt already taken',
      passed: 'already passed',
      no_longer_enrolled: 'no longer enrolled',
      deactivated: 'deactivated',
      exam_disabled: 'exam disabled',
    })
  })

  const done = {
    issued: 3,
    reissuedAfterExpiry: 0,
    skippedAlreadyIssued: 0,
    skippedAttemptTaken: 0,
    skippedDeactivated: 0,
    skippedNoConfig: 0,
    skippedNotEnrolled: 0,
    skippedPassed: 0,
  }

  it('is a plain success for issued codes only', () => {
    expect(issuePopupBanner(done, 3)).toEqual({ tone: 'success', title: 'Issued 3 codes.' })
  })

  it('adds re-issued and already-had-a-code lines without a caution', () => {
    const b = issuePopupBanner(
      { ...done, issued: 3, reissuedAfterExpiry: 2, skippedAlreadyIssued: 1 },
      3,
    )
    expect(b.tone).toBe('success')
    expect(b.title).toBe('Issued 3 codes.')
    expect(b.detail).toBe('Re-issued 2 expired codes. 1 exam already had a code.')
  })

  it('is a caution when nothing was issued', () => {
    const b = issuePopupBanner(
      { ...done, issued: 0, reissuedAfterExpiry: 0, skippedAlreadyIssued: 2 },
      0,
    )
    expect(b.tone).toBe('caution')
    expect(b.title).toBe('Issued 0 codes.')
  })

  it('is a caution with the skipped reasons when something was skipped', () => {
    const b = issuePopupBanner({ ...done, skippedPassed: 2, skippedDeactivated: 1 }, 3)
    expect(b.tone).toBe('caution')
    expect(b.detail).toBe('3 skipped: 2 already passed, 1 deactivated.')
  })

  it('notes a changed count against the preview (issued includes re-issues)', () => {
    expect(issuePopupBanner({ ...done, reissuedAfterExpiry: 1 }, 3).detail).toBe(
      'Re-issued 1 expired code.',
    )
    expect(issuePopupBanner(done, 5).detail).toBe('Counts changed since the preview.')
    expect(issuePopupBanner(done, null).detail).toBeUndefined()
  })
})
