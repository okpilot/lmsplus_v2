import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InfoTooltip } from './info-tooltip'

const BASE_PROPS = {
  label: 'What does this mean?',
  title: 'Daily Activity',
  description: 'Each square shows how many questions you answered that day.',
}

describe('InfoTooltip', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the trigger button with the provided aria-label', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: 'What does this mean?' })).toBeInTheDocument()
  })

  it('renders the tooltip panel as hidden before interaction', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    const panel = screen.getByText('Daily Activity').closest('div')
    // Panel exists in DOM but has "hidden" class — not toggled open yet
    expect(panel?.className).toMatch(/hidden/)
  })

  it('shows the tooltip panel when the trigger button is clicked', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    const button = screen.getByRole('button', { name: 'What does this mean?' })
    fireEvent.click(button)
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/block/)
    expect(panel?.className).not.toMatch(/\bhidden\b/)
  })

  it('hides the tooltip panel when the button is clicked a second time (toggle)', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    const button = screen.getByRole('button', { name: 'What does this mean?' })
    fireEvent.click(button)
    fireEvent.click(button)
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/hidden/)
  })

  it('renders the title and description text inside the panel', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    expect(screen.getByText('Daily Activity')).toBeInTheDocument()
    expect(
      screen.getByText('Each square shows how many questions you answered that day.'),
    ).toBeInTheDocument()
  })

  it('closes the tooltip when a click occurs outside the component', () => {
    render(
      <div>
        <InfoTooltip {...BASE_PROPS} />
        <button type="button">Outside</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'What does this mean?' })
    fireEvent.click(trigger)

    // Verify it opened
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/block/)

    // Click outside
    fireEvent.click(screen.getByRole('button', { name: 'Outside' }), { bubbles: true })
    expect(panel?.className).toMatch(/hidden/)
  })

  it('aligns the panel to the right by default', () => {
    render(<InfoTooltip {...BASE_PROPS} />)
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/right-0/)
  })

  it('aligns the panel to the left when specified', () => {
    render(<InfoTooltip {...BASE_PROPS} align="left" />)
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/left-0/)
  })

  it('centers the panel when specified', () => {
    render(<InfoTooltip {...BASE_PROPS} align="center" />)
    const panel = screen.getByText('Daily Activity').closest('div')
    expect(panel?.className).toMatch(/-translate-x-1\/2/)
  })
})
