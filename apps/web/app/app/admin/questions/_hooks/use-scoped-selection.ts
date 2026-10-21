import { useState } from 'react'

type Selection = { scope: string; ids: string[] }

function keepVisible(ids: string[], visibleIds: readonly string[]) {
  return ids.filter((id) => visibleIds.includes(id))
}

/** Next state when the selection must change for this scope/rows, else null. */
function reconcile(state: Selection, scope: string, visibleIds: readonly string[]) {
  if (state.scope !== scope) return { scope, ids: [] }
  const ids = keepVisible(state.ids, visibleIds)
  return ids.length === state.ids.length ? null : { scope, ids }
}

/**
 * Row selection bound to a list scope (filters + page) and its visible rows.
 * A scope change drops the selection for good; ids that leave the visible set
 * are pruned and stay unselected if they come back.
 */
export function useScopedSelection(scope: string, visibleIds: readonly string[]) {
  const [state, setState] = useState<Selection>({ scope, ids: [] })

  const next = reconcile(state, scope, visibleIds)
  if (next) setState(next)
  const ids = next ? next.ids : state.ids

  function update(change: (base: string[]) => string[]) {
    setState((prev) => {
      if (prev.scope !== scope) return prev
      return { scope, ids: change(keepVisible(prev.ids, visibleIds)) }
    })
  }

  function toggle(id: string) {
    update((base) => (base.includes(id) ? base.filter((i) => i !== id) : [...base, id]))
  }

  function toggleAll() {
    update((base) => (base.length === visibleIds.length ? [] : [...visibleIds]))
  }

  function clear() {
    update(() => [])
  }

  return { selectedIds: ids, toggle, toggleAll, clear }
}
