function findScrollParent(start: HTMLElement | null): HTMLElement | null {
  for (let el = start; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
  }
  return null
}

/** Scrolls only the navigator panel so the current square is visible; never scrolls the page. */
export function scrollPanelToCurrent(grid: HTMLElement | null): void {
  const square = grid?.querySelector<HTMLElement>('[aria-current="step"]')
  const panel = findScrollParent(grid?.parentElement ?? null)
  if (!square || !panel) return
  const sq = square.getBoundingClientRect()
  const pn = panel.getBoundingClientRect()
  if (sq.top < pn.top) panel.scrollTop -= pn.top - sq.top
  else if (sq.bottom > pn.bottom) panel.scrollTop += sq.bottom - pn.bottom
}
