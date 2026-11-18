import type { RosterEntry } from '../types'

const ISSUABLE: ReadonlySet<string> = new Set(['no_code', 'expired', 'voided'])

/** Display-only guess of the server plan: it only enables buttons; the issue preview decides. */
export function isIssuable(e: Pick<RosterEntry, 'status'>, deactivated: boolean): boolean {
  return !deactivated && ISSUABLE.has(e.status)
}
