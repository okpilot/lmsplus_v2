import {
  LIVE_ENTRY_STATUSES,
  NEEDS_CODE_STATUSES,
  type RosterEntry,
  type ShowValue,
} from '../types'

export const SHOW_OPTIONS: readonly { value: ShowValue; label: string }[] = [
  { value: 'all', label: 'All people' },
  { value: 'needs_code', label: 'Needs code' },
  { value: 'attempts', label: 'Has attempts' },
]

/** The expiry every live code shares, or null when they differ or none is live. */
export function sharedExpiry(entries: readonly RosterEntry[]): string | null {
  const stamps = new Set<string>()
  for (const e of entries)
    if (LIVE_ENTRY_STATUSES.has(e.status) && e.codeExpiresAt) stamps.add(e.codeExpiresAt)
  return stamps.size === 1 ? ([...stamps][0] ?? null) : null
}

/** Display only: some exam needs a (new) code. The Issue popup preview stays the authority. */
export function personNeedsCode(entries: readonly Pick<RosterEntry, 'status'>[]): boolean {
  return entries.some((e) => NEEDS_CODE_STATUSES.has(e.status))
}

/** Issue is pointless only when every tick is on this page and none of them needs a code. */
export function nothingToIssue(
  ticks: readonly string[],
  pageIds: readonly string[],
  needsCodeIds: ReadonlySet<string>,
): boolean {
  return ticks.every((id) => pageIds.includes(id)) && !ticks.some((id) => needsCodeIds.has(id))
}
