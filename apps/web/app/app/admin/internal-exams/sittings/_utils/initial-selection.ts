import type { InitialSelection } from '../_hooks/use-roster-selection'
import type { Selection } from '../types'

/** What the provider ticks on a reload or deep link: the validated popup selection, nothing for `whole`/`empty`. */
export function initialSelectionOf(selection: Selection): InitialSelection {
  if (selection.kind === 'all') return { ids: [], all: true }
  if (selection.kind === 'ids') return { ids: selection.ids, all: false }
  return { ids: [], all: false }
}
