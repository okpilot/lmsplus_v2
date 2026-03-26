import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockUseSearchParams } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUseSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: mockUseSearchParams,
}))

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
    // Render a native select so user interactions are observable.
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  // Rendered outside the <select> mock to avoid invalid nesting (span inside select).
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

import { StudentFiltersBar } from './student-filters'

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
})

describe('StudentFiltersBar', () => {
  it('renders the status and role selects and the search input', () => {
    render(<StudentFiltersBar filters={{}} />)
    const selects = screen.getAllByTestId('select')
    expect(selects).toHaveLength(2)
    expect(screen.getByPlaceholderText('Search students...')).toBeInTheDocument()
  })

  it('renders the Clear button', () => {
    render(<StudentFiltersBar filters={{}} />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('navigates to the base students URL when Clear is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(<StudentFiltersBar filters={{}} />)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(mockPush).toHaveBeenCalledWith('/app/admin/students')
  })

  it('reflects the active status filter value in the status select', () => {
    render(<StudentFiltersBar filters={{ status: 'active' }} />)
    const selects = screen.getAllByTestId('select')
    // First select = status
    expect((selects[0] as HTMLSelectElement).value).toBe('active')
  })

  it('reflects the role filter value in the role select', () => {
    render(<StudentFiltersBar filters={{ role: 'admin' }} />)
    const selects = screen.getAllByTestId('select')
    // Second select = role
    expect((selects[1] as HTMLSelectElement).value).toBe('admin')
  })

  it('pre-fills the search input from the filter prop', () => {
    render(<StudentFiltersBar filters={{ search: 'alice' }} />)
    expect(screen.getByPlaceholderText('Search students...')).toHaveValue('alice')
  })

  it('defaults both selects to the __all__ sentinel when no filters are set', () => {
    render(<StudentFiltersBar filters={{}} />)
    const selects = screen.getAllByTestId('select')
    expect((selects[0] as HTMLSelectElement).value).toBe('__all__')
    expect((selects[1] as HTMLSelectElement).value).toBe('__all__')
  })
})
