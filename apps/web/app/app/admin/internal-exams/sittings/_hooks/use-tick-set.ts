import { useCallback, useMemo, useState } from 'react'

export type TickSet = {
  /** Ticked ids, in tick order. */
  ids: string[]
  toggle: (id: string) => void
  /** Ticks or unticks every given id; other ticks stay. */
  setMany: (ids: readonly string[], checked: boolean) => void
  clear: () => void
}

/** An ordered set of ticked ids; shared by the roster ticks and the Add people popup ticks. */
export function useTickSet(initial: readonly string[] = []): TickSet {
  const [ids, setIds] = useState<string[]>(() => [...initial])
  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  )
  const setMany = useCallback(
    (many: readonly string[], checked: boolean) =>
      setIds((prev) =>
        checked
          ? [...prev, ...many.filter((id, i) => !prev.includes(id) && many.indexOf(id) === i)]
          : prev.filter((id) => !many.includes(id)),
      ),
    [],
  )
  const clear = useCallback(() => setIds([]), [])
  return useMemo(() => ({ ids, toggle, setMany, clear }), [ids, toggle, setMany, clear])
}
