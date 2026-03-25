import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Base UI Select so tests are not tied to portal/floating-layer internals.
// The `disabled` prop lives on the Select root and must be forwarded via context.
// We simulate this by passing it through a data attribute on a wrapping div and
// having SelectTrigger read the closest ancestor's data-disabled attribute — but
// the simplest approach is to render the trigger button inside the Select mock
// directly so disabled state is co-located.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
    'aria-label': ariaLabel,
  }: {
    value: string
    disabled?: boolean
    onValueChange: (v: string) => void
    children: React.ReactNode
    'aria-label'?: string
  }) => (
    // Render a button here so the disabled state is observable via toBeDisabled().
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      data-testid="select"
      data-value={value}
      onClick={() => onValueChange(value)}
    >
      {children}
    </button>
  ),
  SelectTrigger: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    'aria-label'?: string
  }) => (
    <button aria-label={ariaLabel} type="button">
      {children}
    </button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
}))

import { DifficultyStatusSelect } from './difficulty-status-select'

describe('DifficultyStatusSelect', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders both Difficulty and Status labels', () => {
    render(
      <DifficultyStatusSelect
        difficulty="medium"
        status="active"
        isPending={false}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Difficulty')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('disables both selects when isPending is true', () => {
    render(
      <DifficultyStatusSelect
        difficulty="medium"
        status="active"
        isPending={true}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    // Our Select mock renders as a <button> so toBeDisabled() reflects the disabled prop.
    const selects = screen.getAllByTestId('select')
    expect(selects).toHaveLength(2)
    for (const select of selects) {
      expect(select).toBeDisabled()
    }
  })

  it('does not disable selects when isPending is false', () => {
    render(
      <DifficultyStatusSelect
        difficulty="medium"
        status="active"
        isPending={false}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    const selects = screen.getAllByTestId('select')
    expect(selects).toHaveLength(2)
    for (const select of selects) {
      expect(select).not.toBeDisabled()
    }
  })
})
