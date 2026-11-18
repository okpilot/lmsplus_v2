import { plural } from './plural'

/** One banner shown at a time; its tone follows the outcome. */
export type ResultBannerData = {
  tone: 'success' | 'caution' | 'danger'
  title: string
  detail?: string
  skippedTitle?: string
  skipped?: string[]
  more?: number
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
    s.entriesNotStarted > 0
      ? `${plural(s.entriesNotStarted, 'exam')} (${plural(s.studentsNotStarted, 'student')}) have not started: they will be marked absent and their codes voided.`
      : '',
    'A closed sitting cannot be reopened.',
  ]
    .filter(Boolean)
    .join(' ')
}

export const START_CONFIRM_TEXT =
  'Candidates can start with their codes until you close the sitting or the day ends (UTC).'
export const CANCEL_CONFIRM_TEXT =
  'Unused codes are voided. A cancelled sitting cannot be restored.'
