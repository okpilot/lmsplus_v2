import type { SubjectEligibility } from '../types'
import { fmtDate, formatTitleDate } from './format-dates'

export type SubjectRowView = {
  /** Only a row some person can actually sit has a checkbox. */
  tickable: boolean
  text: string
  /** Why the rest cannot sit (several people only). */
  reasons: string
}

function singleText(r: SubjectEligibility): string {
  switch (r.state) {
    case 'eligible':
      return r.attemptCount && r.attemptCount > 0 ? `Attempt ${r.attemptCount + 1}` : ''
    case 'passed': {
      const score = r.passedScore === null ? '' : ` · ${Math.round(r.passedScore)}%`
      return r.passedAt ? `Passed ${fmtDate(r.passedAt)}${score}` : 'Passed'
    }
    case 'entered_elsewhere':
      return r.elsewhereAt ? `In sitting ${formatTitleDate(r.elsewhereAt)}` : 'In another sitting'
    case 'attempt_running':
      return 'Attempt running'
    case 'not_enrolled':
      return 'Not enrolled'
    case 'entered_here':
      return 'Already in this sitting'
    case 'deactivated':
      return 'Deactivated'
    default:
      return ''
  }
}

function reasonsText(r: SubjectEligibility): string {
  const parts: [number, string][] = [
    [r.enteredHere, 'already in this sitting'],
    [r.passed, 'passed'],
    [r.attemptRunning, 'attempt running'],
    [r.enteredElsewhere, 'in another sitting'],
    [r.notEnrolled, 'not enrolled'],
    [r.deactivated, 'deactivated'],
  ]
  return parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(', ')
}

/** How one exam row of the Add exams popup reads: state text for one person, "n of m can sit" for several. */
export function subjectRowView(r: SubjectEligibility, singleDeactivated: boolean): SubjectRowView {
  if (r.people === 1 && r.state !== null) {
    return {
      tickable: r.state === 'eligible' && !singleDeactivated,
      text: singleText(r),
      reasons: '',
    }
  }
  return {
    tickable: r.eligible > 0,
    text: `${r.eligible} of ${r.people} can sit`,
    reasons: reasonsText(r),
  }
}
