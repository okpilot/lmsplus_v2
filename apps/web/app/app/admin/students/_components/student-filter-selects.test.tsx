import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { StudentFilterSelects } from './student-filter-selects'

const GROUPS = [{ id: 'a0000000-0000-4000-8000-000000000001', name: 'Cohort A' }]

describe('StudentFilterSelects labels', () => {
  it('AC1: the cleared item of each select is labelled All statuses / All roles / All groups', () => {
    render(<StudentFilterSelects filters={{}} groups={GROUPS} updateFilter={vi.fn()} />)
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All roles' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All groups' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'All' })).not.toBeInTheDocument()
  })

  it('AC1: choosing the All item clears the filter', async () => {
    const updateFilter = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(
      <StudentFilterSelects
        filters={{ group: GROUPS[0]?.id }}
        groups={GROUPS}
        updateFilter={updateFilter}
      />,
    )
    const groupSelect = screen.getAllByTestId('select')[2] as HTMLSelectElement
    const allValue = (screen.getByRole('option', { name: 'All groups' }) as HTMLOptionElement).value
    await user.selectOptions(groupSelect, allValue)
    expect(updateFilter).toHaveBeenCalledWith('group', undefined)
  })
})
