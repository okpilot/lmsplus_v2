import { LIVE_ENTRY_STATUSES, type RosterEntry } from '../types'

export type NextStep =
  | { kind: 'issue'; label: 'Issue code' | 'Re-issue' | 'Issue new code'; href?: undefined }
  | { kind: 'view'; label: 'View attempt'; href: string }

const ISSUE_LABEL = {
  no_code: 'Issue code',
  expired: 'Re-issue',
  voided: 'Issue new code',
} as const

const ATTEMPT: ReadonlySet<string> = new Set(['running', 'finished', 'voided_attempt'])

type Ctx = Readonly<{ editable: boolean; deactivated: boolean }>

/** The one action an exam row offers on its face, or null. */
export function nextStep(e: RosterEntry, { editable, deactivated }: Ctx): NextStep | null {
  if (ATTEMPT.has(e.status)) {
    return e.sessionId
      ? {
          kind: 'view',
          label: 'View attempt',
          href: `/app/admin/internal-exams/report?session=${e.sessionId}`,
        }
      : null
  }
  if (!editable || deactivated) return null
  if (e.status === 'no_code' || e.status === 'expired' || e.status === 'voided') {
    return { kind: 'issue', label: ISSUE_LABEL[e.status] }
  }
  return null
}

/** Only an exam with no attempt yet can be removed. */
const REMOVABLE: ReadonlySet<string> = new Set(['no_code', 'waiting', 'ready', 'expired', 'voided'])

export type ExamActions = { voidCodeId: string | null; canRemove: boolean }

/** The destructive actions an exam row offers: the live code to void, and whether it can be removed. */
export function examActions(
  e: RosterEntry,
  { editable }: Readonly<{ editable: boolean }>,
): ExamActions {
  return {
    voidCodeId: editable && LIVE_ENTRY_STATUSES.has(e.status) ? e.codeId : null,
    canRemove: editable && REMOVABLE.has(e.status),
  }
}
