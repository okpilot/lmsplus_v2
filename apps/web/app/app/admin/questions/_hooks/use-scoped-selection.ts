import { useState } from 'react'

type Selection = { scope: string; ids: string[] }

/**
 * Row selection bound to a list scope (filters + page) and its visible rows.
 * A scope change drops the selection for good; ids that leave the visible set
 * are pruned and stay unselected if they come back.
 */
export function useScopedSelection(scope: string, visibleIds: readonly string[]) {
  const [state, setState] = useState<Selection>({ scope, ids: [] })

  let ids = state.ids
  if (state.scope !== scope) {
    ids = []
    setState({ scope, ids })
  } else if (ids.some((id) => !visibleIds.includes(id))) {
    ids = ids.filter((id) => visibleIds.includes(id))
    setState({ scope, ids })
  }

  function update(next: (base: string[]) => string[]) {
    setState((prev) => {
      const base = prev.scope === scope ? prev.ids.filter((id) => visibleIds.includes(id)) : []
      return { scope, ids: next(base) }
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
