import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollPanelToCurrent } from './scroll-panel-to-current'

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom } as DOMRect
}

function build(squareRect: DOMRect | null, overflowY: string, withSquare = true) {
  const panel = document.createElement('div')
  const grid = document.createElement('div')
  panel.appendChild(grid)
  document.body.appendChild(panel)
  panel.scrollTop = 100
  panel.getBoundingClientRect = () => rect(0, 200)
  if (withSquare) {
    const square = document.createElement('button')
    square.setAttribute('aria-current', 'step')
    if (squareRect) square.getBoundingClientRect = () => squareRect
    grid.appendChild(square)
  }
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el) => ({ overflowY: el === panel ? overflowY : 'visible' }) as CSSStyleDeclaration,
  )
  return { panel, grid }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('scrollPanelToCurrent', () => {
  it('scrolls up by the overshoot when the square is above the panel', () => {
    const { panel, grid } = build(rect(-30, -6), 'auto')
    scrollPanelToCurrent(grid)
    expect(panel.scrollTop).toBe(70)
  })

  it('scrolls down by the overshoot when the square is below the panel', () => {
    const { panel, grid } = build(rect(210, 240), 'scroll')
    scrollPanelToCurrent(grid)
    expect(panel.scrollTop).toBe(140)
  })

  it('does not scroll when the square is fully inside', () => {
    const { panel, grid } = build(rect(50, 80), 'auto')
    scrollPanelToCurrent(grid)
    expect(panel.scrollTop).toBe(100)
  })

  it('no-ops without a current square', () => {
    const { panel, grid } = build(null, 'auto', false)
    scrollPanelToCurrent(grid)
    expect(panel.scrollTop).toBe(100)
  })

  it('no-ops without a scroll ancestor', () => {
    const { panel, grid } = build(rect(-30, -6), 'visible')
    scrollPanelToCurrent(grid)
    expect(panel.scrollTop).toBe(100)
  })

  it('no-ops for a null grid', () => {
    expect(() => scrollPanelToCurrent(null)).not.toThrow()
  })
})
