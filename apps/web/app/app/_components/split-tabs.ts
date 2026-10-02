export const TAB_MIN_WIDTH = 64

/** Shows all items when they fit; otherwise (slots - 1) items plus a More slot. */
export function splitTabs<T>(items: T[], slots: number): { visible: T[]; hidden: T[] } {
  if (items.length <= slots) return { visible: items, hidden: [] }
  const keep = Math.max(0, slots - 1)
  return { visible: items.slice(0, keep), hidden: items.slice(keep) }
}
