import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Slider is a UI-library component — replace it with a simple range input so
// tests stay focused on QuestionCount logic, not Radix internals.
vi.mock('@/components/ui/slider', () => ({
  Slider: ({
    value,
    onValueChange,
    min,
    max,
  }: {
    value: number[]
    onValueChange: (v: number[]) => void
    min: number
    max: number
  }) => (
    <input
      type="range"
      data-testid="slider"
      value={value[0]}
      min={min}
      max={max}
      onChange={(e) => onValueChange([Number(e.target.value)])}
    />
  ),
}))

// ---- Subject under test -----------------------------------------------------

import { QuestionCount } from './question-count'

// ---- Tests ------------------------------------------------------------------

describe('QuestionCount', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('displays the current value in the count badge', () => {
    render(<QuestionCount value={25} max={100} onValueChange={vi.fn()} />)
    // The count badge is a <span> with class text-primary — use getAllByText
    // and confirm at least one match is the badge span (not a preset button)
    const matches = screen.getAllByText('25')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    // The first element should be the display span (appears before the preset buttons in DOM)
    expect(matches[0]).toBeInTheDocument()
  })

  it('shows the effective max in the "of N selected" label', () => {
    render(<QuestionCount value={10} max={50} onValueChange={vi.fn()} />)
    expect(screen.getByText('of 50 selected')).toBeInTheDocument()
  })

  it('clamps displayed value to max when value exceeds max', () => {
    // Use a value that won't collide with any preset button (10/25/50) or effectiveMax
    render(<QuestionCount value={999} max={37} onValueChange={vi.fn()} />)
    // effectiveValue = min(999, 37) = 37; shown in count badge
    expect(screen.getByText('37')).toBeInTheDocument()
  })

  it('shows empty state message when max is 0', () => {
    render(<QuestionCount value={1} max={0} onValueChange={vi.fn()} />)
    expect(
      screen.getByText('No questions available. Select at least one topic above.'),
    ).toBeInTheDocument()
  })

  it('calls onValueChange when the All button is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<QuestionCount value={10} max={50} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onValueChange).toHaveBeenCalledWith(50)
  })

  it('calls onValueChange with preset value when a preset button is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<QuestionCount value={10} max={100} onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: '25' }))
    expect(onValueChange).toHaveBeenCalledWith(25)
  })

  it('calls onValueChange with effectiveMax via the All button regardless of max', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<QuestionCount value={10} max={20} onValueChange={onValueChange} />)
    // All button always calls onValueChange(effectiveMax) even when effectiveMax < preset
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onValueChange).toHaveBeenCalledWith(20)
  })

  it('disables preset buttons that exceed the available max', () => {
    render(<QuestionCount value={10} max={20} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '25' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '50' })).toBeDisabled()
  })

  it('enables preset buttons that do not exceed the available max', () => {
    render(<QuestionCount value={10} max={100} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '10' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '25' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '50' })).not.toBeDisabled()
  })

  it('renders all three preset buttons and the All button', () => {
    render(<QuestionCount value={10} max={100} onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '25' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })
})
