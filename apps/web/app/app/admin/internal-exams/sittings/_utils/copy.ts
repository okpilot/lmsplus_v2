import type { EmailCodesResult } from '../actions/email-sitting-codes'
import type { IssueCounts } from '../actions/issue-sitting-codes'
import { plural } from './plural'

/** One banner shown at a time; its tone follows the outcome. */
export type ResultBannerData = {
  tone: 'success' | 'caution' | 'danger'
  title: string
  detail?: string
  /** Extra lines under the detail (Add exams skips); a banner shows at most 50. */
  lines?: string[]
}

function notStartedLine(entries: number, students: number): string {
  if (entries === 0) return ''
  const counts = `${plural(entries, 'exam')} (${plural(students, 'student')})`
  return entries === 1
    ? `${counts} has not started: it will be marked absent and its code voided.`
    : `${counts} have not started: they will be marked absent and their codes voided.`
}

export function closeConfirmText(s: {
  attemptsRunning: number
  entriesNotStarted: number
  studentsNotStarted: number
}): string {
  return [
    s.attemptsRunning > 0
      ? `${plural(s.attemptsRunning, 'attempt')} running will continue to the end.`
      : '',
    notStartedLine(s.entriesNotStarted, s.studentsNotStarted),
    'A closed sitting cannot be reopened.',
  ]
    .filter(Boolean)
    .join(' ')
}

export const START_CONFIRM_TEXT =
  'Candidates can start with their codes until you close the sitting or the day ends (UTC).'
export const CANCEL_CONFIRM_TEXT =
  'Unused codes are voided. A cancelled sitting cannot be restored.'

/** Why a single-entry issue produced no code. */
export function issueSkipText(
  d: Pick<
    IssueCounts,
    | 'skippedAlreadyIssued'
    | 'skippedAttemptTaken'
    | 'skippedDeactivated'
    | 'skippedNoConfig'
    | 'skippedNotEnrolled'
    | 'skippedPassed'
  >,
): string {
  const reasons = [
    d.skippedAlreadyIssued > 0 ? 'already has a code' : '',
    d.skippedAttemptTaken > 0 ? 'attempt already taken' : '',
    d.skippedPassed > 0 ? 'already passed' : '',
    d.skippedNotEnrolled > 0 ? 'no longer enrolled' : '',
    d.skippedDeactivated > 0 ? 'deactivated' : '',
    d.skippedNoConfig > 0 ? 'exam disabled' : '',
  ].filter(Boolean)
  return reasons.length > 0 ? `Skipped: ${reasons.join(', ')}.` : ''
}

const FAILED_LISTED = 5

function failedNames(failed: EmailCodesResult['failed']): string {
  const listed = failed
    .slice(0, FAILED_LISTED)
    .map((f) => `${f.studentName ?? 'Unknown'} (${f.subjectName})`)
    .join(', ')
  const more = failed.length - FAILED_LISTED
  return more > 0 ? `${listed}, and ${more} more` : listed
}

/** Result of the bulk Email codes: `Emailed N`, then a line per failure, skip and unrecorded send. */
export function emailCodesBanner(d: EmailCodesResult): ResultBannerData {
  const lines = [
    d.failed.length > 0 ? `Failed ${d.failed.length}: ${failedNames(d.failed)}` : '',
    d.skipped > 0 ? `Skipped ${d.skipped} (no email or deactivated)` : '',
    d.unrecorded > 0 ? `${d.unrecorded} sent but not recorded` : '',
  ].filter(Boolean)
  return {
    tone: d.failed.length > 0 || d.unrecorded > 0 ? 'caution' : 'success',
    title: `Emailed ${d.sent}`,
    ...(lines.length > 0 ? { lines } : {}),
  }
}
