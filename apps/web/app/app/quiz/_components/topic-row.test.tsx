import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Mock Checkbox to a plain input so tests do not depend on Radix internals.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean | 'indeterminate') => void
  }) => (
    <input
      type="checkbox"
      data-testid="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}))

// Mock lucide icons to lightweight stand-ins.
vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
}))

// ---- Subject under test -----------------------------------------------------

import { TopicRow } from './topic-row'

// ---- Tests ------------------------------------------------------------------

describe('TopicRow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the topic code and name', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    )
    expect(screen.getByText('050-01 — The Atmosphere')).toBeInTheDocument()
  })

  it('renders the question count', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    )
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('calls onCheckedChange with true when checkbox is checked', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    )
    await user.click(screen.getByTestId('checkbox'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('shows ChevronDown icon when onToggleExpand is provided and row is expanded', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
        isExpanded={true}
        onToggleExpand={vi.fn()}
      />,
    )
    expect(screen.getByTestId('icon-chevron-down')).toBeInTheDocument()
    expect(screen.queryByTestId('icon-chevron-right')).not.toBeInTheDocument()
  })

  it('shows ChevronRight icon when onToggleExpand is provided and row is collapsed', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    )
    expect(screen.getByTestId('icon-chevron-right')).toBeInTheDocument()
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument()
  })

  it('calls onToggleExpand when the expand button is clicked', async () => {
    const onToggleExpand = vi.fn()
    const user = userEvent.setup()
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
        isExpanded={false}
        onToggleExpand={onToggleExpand}
      />,
    )
    await user.click(screen.getByRole('button'))
    expect(onToggleExpand).toHaveBeenCalledOnce()
  })

  it('does not render an expand button when onToggleExpand is not provided', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    )
    // No expand button, so no chevron icons
    expect(screen.queryByTestId('icon-chevron-right')).not.toBeInTheDocument()
    expect(screen.queryByTestId('icon-chevron-down')).not.toBeInTheDocument()
  })
})
