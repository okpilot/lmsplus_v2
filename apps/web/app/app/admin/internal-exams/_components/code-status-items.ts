import { ENTRY_STATUS_LABEL } from '../sittings/_utils/entry-text'
import { CODE_FILTER_STATUSES, type CodeFilterStatus } from '../types'

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
const FILTER_LABEL: Record<CodeFilterStatus, string> = {
  active: 'Active / Waiting',
  consumed: 'In progress',
  finished: 'Finished',
  discarded: 'Discarded',
  voided: 'Voided',
  expired: 'Expired',
}

export const STATUS_ITEMS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '__all__', label: 'All' },
  ...CODE_FILTER_STATUSES.map((value) => ({ value, label: FILTER_LABEL[value] })),
]

export function statusLabel(status: string): string {
  return ROW_LABEL[status] ?? status
}
