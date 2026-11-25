import { useCallback, useMemo, useState } from 'react'

export type RosterSelection = {
  /** Ticked people, in tick order. */
  rosterIds: string[]
  toggleRoster: (id: string) => void
  /** Ticks or unticks every id of the shown page; other pages' ticks stay. */
  setRosterPage: (pageIds: readonly string[], checked: boolean) => void
  clearRoster: () => void
}

export const NO_ROSTER: RosterSelection = {
  rosterIds: [],
  toggleRoster: () => undefined,
  setRosterPage: () => undefined,
  clearRoster: () => undefined,
}

export function useRosterSelection(): RosterSelection {
  const [rosterIds, setIds] = useState<string[]>([])
  const toggleRoster = useCallback(
    (id: string) =>
      setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )
  const setRosterPage = useCallback(
    (pageIds: readonly string[], checked: boolean) =>
      setIds((prev) =>
        checked
          ? [...prev, ...pageIds.filter((id) => !prev.includes(id))]
          : prev.filter((id) => !pageIds.includes(id)),
      ),
    [],
  )
  const clearRoster = useCallback(() => setIds([]), [])
  return useMemo(
    () => ({ rosterIds, toggleRoster, setRosterPage, clearRoster }),
    [rosterIds, toggleRoster, setRosterPage, clearRoster],
  )
}
