import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionFilters } from './question-filters'

// Mock the Switch to a simple checkbox for testability
vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}))

describe('QuestionFilters', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all 3 filter toggles', () => {
    render(<QuestionFilters value={['all']} onValueChange={vi.fn()} />)
    expect(screen.getByText('Previously unseen')).toBeInTheDocument()
    expect(screen.getByText('Incorrectly answered')).toBeInTheDocument()
    expect(screen.getByText('Flagged questions')).toBeInTheDocument()
  })

  it('all switches are off when value is [all]', () => {
    render(<QuestionFilters value={['all']} onValueChange={vi.fn()} />)
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(3)
    for (const s of switches) {
      expect(s).not.toBeChecked()
    }
  })

  it('marks the correct switch as on when a filter is active', () => {
    render(<QuestionFilters value={['unseen']} onValueChange={vi.fn()} />)
    const switches = screen.getAllByRole('switch')
    // Order: unseen, incorrect, flagged
    expect(switches[0]).toBeChecked()
    expect(switches[1]).not.toBeChecked()
    expect(switches[2]).not.toBeChecked()
  })

  it('toggling on a filter calls onValueChange with that filter', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['all']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it("toggling off the only active filter reverts to ['all']", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle off unseen
    expect(onValueChange).toHaveBeenCalledWith(['all'])
  })

  it('selecting unseen auto-deselects incorrect and flagged', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['incorrect', 'flagged']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle on unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it('selecting incorrect auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[1]!) // toggle on incorrect
    expect(onValueChange).toHaveBeenCalledWith(['incorrect'])
  })

  it('selecting flagged auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['unseen']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['flagged'])
  })

  it('incorrect and flagged can be active simultaneously', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<QuestionFilters value={['incorrect']} onValueChange={onValueChange} />)
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['incorrect', 'flagged'])
  })

  it('renders info buttons for each filter', () => {
    render(<QuestionFilters value={['all']} onValueChange={vi.fn()} />)
    const hintButtons = screen.getAllByLabelText(/Info about/)
    expect(hintButtons).toHaveLength(3)
  })
})
