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

  it('reflects the current "active" value in the select', () => {
    render(<StudentStatusFilter value="active" onChange={vi.fn()} />)
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.value).toBe('active')
  })

  it('reflects the "inactive" value in the select', () => {
    render(<StudentStatusFilter value="inactive" onChange={vi.fn()} />)
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.value).toBe('inactive')
  })

  it('reflects the "all" value in the select', () => {
    render(<StudentStatusFilter value="all" onChange={vi.fn()} />)
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.value).toBe('all')
  })

  it('renders all three status options', () => {
    render(<StudentStatusFilter value="all" onChange={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'All Students' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Inactive' })).toBeInTheDocument()
  })

  it('calls onChange with the selected value when the user picks an option', () => {
    const onChange = vi.fn()
    render(<StudentStatusFilter value="all" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'active' } })
    expect(onChange).toHaveBeenCalledWith('active')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('calls onChange with "inactive" when the user picks Inactive', () => {
    const onChange = vi.fn()
    render(<StudentStatusFilter value="all" onChange={onChange} />)
    fireEvent.change(screen.getByTestId('select'), { target: { value: 'inactive' } })
    expect(onChange).toHaveBeenCalledWith('inactive')
  })
})
