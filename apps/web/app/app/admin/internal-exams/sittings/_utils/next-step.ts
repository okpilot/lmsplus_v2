import {
  LIVE_ENTRY_STATUSES,
  NEEDS_CODE_STATUSES,
  type NeedsCodeStatus,
  type RosterEntry,
  SITTING_ROOT,
} from '../types'

type IssueLabel = 'Issue code' | 'Re-issue' | 'Issue new code'

export type NextStep =
  | { kind: 'issue'; label: IssueLabel; href?: undefined }
  | { kind: 'view'; label: 'View attempt'; href: string }

const ISSUE_LABEL: Record<NeedsCodeStatus, IssueLabel> = {
  no_code: 'Issue code',
  expired: 'Re-issue',
  voided: 'Issue new code',
}

const ATTEMPT: ReadonlySet<string> = new Set(['finished', 'voided_attempt'])

type Ctx = Readonly<{ editable: boolean; deactivated: boolean }>

/** The one action an exam row offers on its face, or null. */
export function nextStep(e: RosterEntry, { editable, deactivated }: Ctx): NextStep | null {
  if (ATTEMPT.has(e.status)) {
    return e.sessionId
      ? {
          kind: 'view',
          label: 'View attempt',
          href: `${SITTING_ROOT}/report?session=${e.sessionId}`,
        }
      : null
  }
  if (!editable || deactivated) return null
  if (NEEDS_CODE_STATUSES.has(e.status)) {
    return { kind: 'issue', label: ISSUE_LABEL[e.status as NeedsCodeStatus] }
  }
  return null
}

/** Only an exam with no attempt yet can be removed. */
const REMOVABLE: ReadonlySet<string> = new Set(['no_code', 'waiting', 'ready', 'expired', 'voided'])

export type ExamActions = { voidCodeId: string | null; canRemove: boolean; canEmail: boolean }

/** The actions an exam row offers: the live code to void, whether it can be removed, and whether its code can be emailed. */
export function examActions(
  e: RosterEntry,
  { editable, deactivated }: Readonly<{ editable: boolean; deactivated: boolean }>,
): ExamActions {
  const voidCodeId = editable && LIVE_ENTRY_STATUSES.has(e.status) ? e.codeId : null
  return {
    voidCodeId,
    canRemove: editable && REMOVABLE.has(e.status),
    canEmail: voidCodeId !== null && !deactivated,
  }
}
