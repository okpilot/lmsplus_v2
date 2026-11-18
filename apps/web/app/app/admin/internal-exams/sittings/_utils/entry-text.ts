import { type EntryStatus, LIVE_ENTRY_STATUSES, type RosterEntry } from '../types'
import { formatTitleDate } from './format-dates'

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  no_code: 'No code',
  waiting: 'Waiting for start',
  ready: 'Ready',
  expired: 'Expired',
  voided: 'Voided',
  voided_attempt: 'Attempt voided',
  running: 'Running',
  finished: 'Finished',
  absent: 'Absent',
  discarded: 'Attempt discarded',
}

const VOID_REASON_LABEL: Record<string, string> = {
  sitting_closed: 'sitting closed',
  sitting_cancelled: 'sitting cancelled',
  reissued_after_expiry: 're-issued after expiry',
  entry_removed: 'exam removed',
  candidate_removed: 'person removed',
}

const SHOWS_CODE: ReadonlySet<EntryStatus> = new Set(['waiting', 'ready', 'running', 'finished'])

export type EntryStatusText = { label: string; tone: 'neutral' | 'success' | 'danger' }

/** Passed / Failed for a graded attempt, the status label otherwise. */
export function entryStatusText(e: Pick<RosterEntry, 'status' | 'passed'>): EntryStatusText {
  if (e.status === 'finished' && e.passed !== null) {
    return e.passed ? { label: 'Passed', tone: 'success' } : { label: 'Failed', tone: 'danger' }
  }
  return { label: ENTRY_STATUS_LABEL[e.status], tone: 'neutral' }
}

/** The code is shown only for these statuses, and only when the roster returned one. */
export function showsCode(e: Pick<RosterEntry, 'status' | 'code'>): boolean {
  return e.code !== null && SHOWS_CODE.has(e.status)
}

function attemptText(e: RosterEntry): string {
  if (e.status === 'voided_attempt') return 'Attempt voided'
  const n = e.attemptNumber ? `Attempt ${e.attemptNumber}` : ''
  if (e.status === 'running') {
    const started = e.sessionStartedAt ? `Started ${formatTitleDate(e.sessionStartedAt)}` : ''
    return [n, started].filter(Boolean).join(' · ')
  }
  if (e.status === 'finished') {
    const score = e.score === null ? '' : `${Math.round(e.score)}%`
    const result = e.passed === null ? '' : e.passed ? 'Passed' : 'Failed'
    return [n, score, result].filter(Boolean).join(' · ')
  }
  return ''
}

function codeText(e: RosterEntry, sharedExpiry: boolean): string {
  if (e.status === 'voided') {
    const why = e.voidReason ? (VOID_REASON_LABEL[e.voidReason] ?? e.voidReason) : ''
    return why ? `Voided: ${why}` : 'Voided'
  }
  if (!e.codeExpiresAt) return ''
  if (e.status === 'expired') return `Expired ${formatTitleDate(e.codeExpiresAt)}`
  if (LIVE_ENTRY_STATUSES.has(e.status) && !sharedExpiry) {
    return `Valid until ${formatTitleDate(e.codeExpiresAt)}`
  }
  return ''
}

/** Caption facts of an exam row joined with " · ". No email text until 2c. */
export function entryFacts(e: RosterEntry, opts: Readonly<{ sharedExpiry: boolean }>): string {
  return [
    attemptText(e),
    codeText(e, opts.sharedExpiry),
    e.status === 'absent' ? 'Did not start' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
