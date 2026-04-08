import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Base UI Select to avoid portal complexity in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
    items?: { value: string; label: string }[]
  }) => (
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({
    'aria-label': ariaLabel,
  }: {
    children?: React.ReactNode
    'aria-label'?: string
  }) => <button type="button" aria-label={ariaLabel} />,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { StudentStatusFilter } from './student-status-filter'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('StudentStatusFilter', () => {
  it('renders the filter label', () => {
    render(<StudentStatusFilter value="all" onChange={vi.fn()} />)
    expect(screen.getByText('Filter:')).toBeInTheDocument()
  })

  it('renders a select with the correct accessible label', () => {
    render(<StudentStatusFilter value="all" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Student status filter' })).toBeInTheDocument()
  })

  it('calls onChange with "active" when the user picks Active', () => {
    const onChange = vi.fn()
    render(<StudentStatusFilter value="all" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'active' } })
    expect(onChange).toHaveBeenCalledWith('active')
  })

  it('calls onChange with "inactive" when the user picks Inactive (from active)', () => {
    const onChange = vi.fn()
    render(<StudentStatusFilter value="active" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'inactive' } })
    expect(onChange).toHaveBeenCalledWith('inactive')
  })

  it('calls onChange with "all" when the user picks All Students', () => {
    const onChange = vi.fn()
    render(<StudentStatusFilter value="inactive" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'all' } })
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
