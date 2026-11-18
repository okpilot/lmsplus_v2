import { useCallback, useMemo, useState } from 'react'
import { useTickSet } from './use-tick-set'

export type RosterSelection = {
  /** Ticked people, in tick order. Empty in all-mode. */
  rosterIds: string[]
  /** All-mode: every person of the sitting, no exclusions. */
  selectAll: boolean
  /** Ticks one person; leaves all-mode (and empties the ticks) when it is on. */
  toggleRoster: (id: string) => void
  /** Ticks or unticks every id of the shown page; other pages' ticks stay. Leaves all-mode. */
  setRosterPage: (pageIds: readonly string[], checked: boolean) => void
  /** Enters or leaves all-mode; entering empties the ticks. */
  setSelectAll: (on: boolean) => void
  clearRoster: () => void
}

export const NO_ROSTER: RosterSelection = {
  rosterIds: [],
  selectAll: false,
  toggleRoster: () => undefined,
  setRosterPage: () => undefined,
  setSelectAll: () => undefined,
  clearRoster: () => undefined,
}

export function useRosterSelection(): RosterSelection {
  const ticks = useTickSet()
  const [selectAll, setAll] = useState(false)
  const { toggle, setMany, clear } = ticks
  const leaveAll = useCallback(() => {
    setAll(false)
    clear()
  }, [clear])
  const toggleRoster = useCallback(
    (id: string) => (selectAll ? leaveAll() : toggle(id)),
    [selectAll, leaveAll, toggle],
  )
  const setRosterPage = useCallback(
    (pageIds: readonly string[], checked: boolean) =>
      selectAll ? leaveAll() : setMany(pageIds, checked),
    [selectAll, leaveAll, setMany],
  )
  const setSelectAll = useCallback(
    (on: boolean) => {
      if (on) clear()
      setAll(on)
    },
    [clear],
  )
  const clearRoster = leaveAll
  return useMemo(
    () => ({
      rosterIds: ticks.ids,
      selectAll,
      toggleRoster,
      setRosterPage,
      setSelectAll,
      clearRoster,
    }),
    [ticks.ids, selectAll, toggleRoster, setRosterPage, setSelectAll, clearRoster],
  )
}
