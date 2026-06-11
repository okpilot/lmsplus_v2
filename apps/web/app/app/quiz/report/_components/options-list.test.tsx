import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OptionsList } from './options-list'

const baseOptions = [
  { id: 'opt-a', text: 'Upward force' },
  { id: 'opt-b', text: 'Downward force' },
  { id: 'opt-c', text: 'Sideways force' },
  { id: 'opt-d', text: 'No force' },
]

describe('OptionsList', () => {
  it('renders nothing when options array is empty', () => {
    const { container } = render(
      <OptionsList options={[]} correctOptionId="opt-a" selectedOptionId="opt-a" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders all option texts', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-b" />)
    expect(screen.getByText('Upward force')).toBeInTheDocument()
    expect(screen.getByText('Downward force')).toBeInTheDocument()
    expect(screen.getByText('Sideways force')).toBeInTheDocument()
    expect(screen.getByText('No force')).toBeInTheDocument()
  })

  it('assigns letters A/B/C/D by index order', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-a" />)
    const letters = screen.getAllByText(/^[A-D]$/)
    expect(letters.map((el) => el.textContent)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('marks the correct option with a "Correct" label', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-b" />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('marks the selected-wrong option with "Your answer" label', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-b" />)
    expect(screen.getByText('Your answer')).toBeInTheDocument()
  })

  it('shows both "Correct" and "Your answer" markers when selected option is correct', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-a" />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('· Your answer')).toBeInTheDocument()
  })

  it('shows no "Your answer" marker when selectedOptionId matches no option', () => {
    render(
      <OptionsList
        options={baseOptions}
        correctOptionId="opt-a"
        selectedOptionId="opt-nonexistent"
      />,
    )
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument()
    expect(screen.queryByText('· Your answer')).not.toBeInTheDocument()
  })

  it('shows the correct marker but no "Your answer" when selectedOptionId is null (text-answer row)', () => {
    // VFR RT text-answer rows carry selected_option_id = NULL (mig 095)
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId={null} />)
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument()
  })

  it('shows no markers on neutral options', () => {
    render(<OptionsList options={baseOptions} correctOptionId="opt-a" selectedOptionId="opt-b" />)
    expect(screen.getAllByText('Correct')).toHaveLength(1)
    expect(screen.getAllByText('Your answer')).toHaveLength(1)
  })
})
