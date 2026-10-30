import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyboardLegend } from './keyboard-legend'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('KeyboardLegend', () => {
  it('renders the keyboard shortcuts toggle button', () => {
    render(<KeyboardLegend />)
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
  })

  it('does not show the shortcuts panel on initial render', () => {
    render(<KeyboardLegend />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the shortcuts panel when the button is clicked', () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lists every shortcut row when the panel is open', () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))

    // Each row has an action label — verify they are all present
    expect(screen.getByText('Previous / next question')).toBeInTheDocument()
    expect(screen.getByText('Move answer highlight')).toBeInTheDocument()
    expect(screen.getByText('Submit highlighted answer')).toBeInTheDocument()
    expect(screen.getByText('Question tab')).toBeInTheDocument()
    expect(screen.getByText('Explanation tab')).toBeInTheDocument()
    expect(screen.getByText('Comments tab')).toBeInTheDocument()
    expect(screen.getByText('Stats tab')).toBeInTheDocument()
  })

  it('lists the key glyphs in the panel', () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))

    expect(screen.getByText('← / →')).toBeInTheDocument()
    expect(screen.getByText('↑ / ↓')).toBeInTheDocument()
    expect(screen.getByText('Enter')).toBeInTheDocument()
    expect(screen.getByText('Q')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('closes the panel when the button is clicked a second time', () => {
    render(<KeyboardLegend />)
    const toggleBtn = screen.getByRole('button', { name: 'Keyboard shortcuts' })

    fireEvent.click(toggleBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('hides the tab shortcuts in exam mode where they do not apply', () => {
    render(<KeyboardLegend isExam />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))

    // Navigation shortcuts still shown
    expect(screen.getByText('Previous / next question')).toBeInTheDocument()
    expect(screen.getByText('Submit highlighted answer')).toBeInTheDocument()
    // Tab shortcuts (q/e/c/s) are suppressed in exam mode
    expect(screen.queryByText('Question tab')).not.toBeInTheDocument()
    expect(screen.queryByText('Explanation tab')).not.toBeInTheDocument()
    expect(screen.queryByText('Comments tab')).not.toBeInTheDocument()
    expect(screen.queryByText('Stats tab')).not.toBeInTheDocument()
  })

  it('closes the panel when Escape is pressed', async () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('marks the toggle button as expanded when the panel is open', () => {
    render(<KeyboardLegend />)
    const btn = screen.getByRole('button', { name: 'Keyboard shortcuts' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('KeyboardLegend surfaces', () => {
  it('floats the popover with a ring and shadow and no border', () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    const el = screen.getByRole('dialog')
    expect(el).toHaveClass('ring-1', 'shadow-raised')
    expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
  })

  it('gives each key a bottom key edge', () => {
    render(<KeyboardLegend />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    expect(screen.getByText('Enter')).toHaveClass('border-b-2')
  })
})
