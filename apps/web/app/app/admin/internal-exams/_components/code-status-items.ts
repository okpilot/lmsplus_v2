import { ENTRY_STATUS_LABEL } from '../sittings/_utils/entry-text'

const ROW_LABEL: Record<string, string> = {
  active: 'Active',
  waiting: ENTRY_STATUS_LABEL.waiting,
  consumed: 'In progress',
  finished: 'Finished',
  discarded: 'Discarded',
  voided: 'Voided',
  expired: 'Expired',
}

/**
 * Filter labels, not row labels. The `active` filter has no sitting predicate, so it also returns
 * the codes of a scheduled sitting, which the row badge calls Waiting.
 */
export const STATUS_ITEMS = [
  { value: '__all__', label: 'All' },
  { value: 'active', label: 'Active / Waiting' },
  { value: 'consumed', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'voided', label: 'Voided' },
  { value: 'expired', label: 'Expired' },
] as const

export function statusLabel(status: string): string {
  return ROW_LABEL[status] ?? status
}
