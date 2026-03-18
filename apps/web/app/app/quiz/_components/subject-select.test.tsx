import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Mock shadcn Select so tests are not tied to Radix Portal internals.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <div data-testid="select" data-value={value}>
      <button type="button" onClick={() => onValueChange('sub-2')}>
        trigger
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
}))

// ---- Subject under test -----------------------------------------------------

import { SubjectSelect } from './subject-select'

// ---- Fixtures ---------------------------------------------------------------

const SUBJECTS = [
  { id: 'sub-1', code: '010', name: 'Air Law', short: 'ALW', questionCount: 40 },
  { id: 'sub-2', code: '050', name: 'Meteorology', short: 'MET', questionCount: 80 },
]

// ---- Tests ------------------------------------------------------------------

describe('SubjectSelect', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders subject items with code, name, and question count', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByText('010 — Air Law (40)')).toBeInTheDocument()
    expect(screen.getByText('050 — Meteorology (80)')).toBeInTheDocument()
  })

  it('calls onValueChange when the select value changes', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: 'trigger' }))
    expect(onValueChange).toHaveBeenCalledWith('sub-2')
  })

  it('renders with an empty subjects list without crashing', () => {
    render(<SubjectSelect subjects={[]} value="" onValueChange={vi.fn()} />)
    expect(screen.getByTestId('select')).toBeInTheDocument()
  })

  it('passes the current value to the Select component', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="sub-1" onValueChange={vi.fn()} />)
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'sub-1')
  })
})
