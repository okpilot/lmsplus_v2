import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalcMode } from '../types'
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

// Mock the Select to a native <select> so we can drive value changes in jsdom.
// base-ui's Select renders a portal-based popup that's awkward to test directly;
// the contract we care about is "renders the three options and reports the chosen value".
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    items?: unknown
    children: React.ReactNode
  }) => (
    <select
      data-testid="calc-select"
      aria-label="Calculation questions"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

function renderFilters(props: Partial<React.ComponentProps<typeof QuestionFilters>> = {}) {
  return render(
    <QuestionFilters
      value={props.value ?? ['all']}
      onValueChange={props.onValueChange ?? vi.fn()}
      calcMode={props.calcMode ?? 'all'}
      onCalcModeChange={props.onCalcModeChange ?? vi.fn()}
    />,
  )
}

describe('QuestionFilters', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all 3 filter toggles', () => {
    renderFilters()
    expect(screen.getByText('Previously unseen')).toBeInTheDocument()
    expect(screen.getByText('Incorrectly answered')).toBeInTheDocument()
    expect(screen.getByText('Flagged questions')).toBeInTheDocument()
  })

  it('all switches are off when value is [all]', () => {
    renderFilters()
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(3)
    for (const s of switches) {
      expect(s).not.toBeChecked()
    }
  })

  it('marks the correct switch as on when a filter is active', () => {
    renderFilters({ value: ['unseen'] })
    const switches = screen.getAllByRole('switch')
    // Order: unseen, incorrect, flagged
    expect(switches[0]).toBeChecked()
    expect(switches[1]).not.toBeChecked()
    expect(switches[2]).not.toBeChecked()
  })

  it('toggling on a filter calls onValueChange with that filter', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it("toggling off the only active filter reverts to ['all']", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle off unseen
    expect(onValueChange).toHaveBeenCalledWith(['all'])
  })

  it('selecting unseen auto-deselects incorrect and flagged', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['incorrect', 'flagged'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[0]!) // toggle on unseen
    expect(onValueChange).toHaveBeenCalledWith(['unseen'])
  })

  it('selecting incorrect auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[1]!) // toggle on incorrect
    expect(onValueChange).toHaveBeenCalledWith(['incorrect'])
  })

  it('selecting flagged auto-deselects unseen', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['unseen'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['flagged'])
  })

  it('incorrect and flagged can be active simultaneously', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    renderFilters({ value: ['incorrect'], onValueChange })
    const switches = screen.getAllByRole('switch')
    await user.click(switches[2]!) // toggle on flagged
    expect(onValueChange).toHaveBeenCalledWith(['incorrect', 'flagged'])
  })

  it('renders info buttons for each filter', () => {
    renderFilters()
    const hintButtons = screen.getAllByLabelText(/Info about/)
    expect(hintButtons).toHaveLength(3)
  })

  // ---- Calculation tri-state Select --------------------------------------

  it('renders the three calculation options', () => {
    renderFilters()
    expect(
      screen.getByRole('option', { name: 'Include calculation questions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Only calculation questions' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Exclude calculation questions' }),
    ).toBeInTheDocument()
  })

  it('reflects the current calcMode value', () => {
    renderFilters({ calcMode: 'only' })
    expect(screen.getByTestId('calc-select')).toHaveValue('only')
  })

  it('calls onCalcModeChange when a calculation option is selected', async () => {
    const user = userEvent.setup()
    const onCalcModeChange = vi.fn()
    renderFilters({ onCalcModeChange })
    await user.selectOptions(screen.getByTestId('calc-select'), 'exclude')
    expect(onCalcModeChange).toHaveBeenCalledWith<[CalcMode]>('exclude')
  })

  it('does not add a hint button for the calculation Select (keeps 3 hint buttons)', () => {
    renderFilters()
    expect(screen.getAllByLabelText(/Info about/)).toHaveLength(3)
  })
})
