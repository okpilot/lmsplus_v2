import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/app/admin/students',
}))

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

import { StudentFiltersBar } from './student-filters'

const G1 = 'a0000000-0000-4000-8000-000000000001'
const GROUPS = [
  { id: G1, name: 'Cohort A' },
  { id: 'a0000000-0000-4000-8000-000000000002', name: 'Cohort B' },
]

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/app/admin/students?page=4&status=active')
})

describe('StudentFiltersBar group filter', () => {
  it('renders a third select listing every group', () => {
    render(<StudentFiltersBar filters={{}} groups={GROUPS} />)
    expect(screen.getAllByTestId('select')).toHaveLength(3)
    expect(screen.getByRole('option', { name: 'Cohort A' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cohort B' })).toBeInTheDocument()
  })

  it('reflects the active group filter in the group select', () => {
    render(<StudentFiltersBar filters={{ group: G1 }} groups={GROUPS} />)
    expect((screen.getAllByTestId('select')[2] as HTMLSelectElement).value).toBe(G1)
  })

  it('sets the group param and resets the page when a group is chosen', async () => {
    const user = userEvent.setup({ delay: null })
    render(<StudentFiltersBar filters={{}} groups={GROUPS} />)
    await user.selectOptions(screen.getAllByTestId('select')[2] as HTMLSelectElement, G1)
    const url = String(mockReplace.mock.calls.at(-1)?.[0])
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('group')).toBe(G1)
    expect(params.has('page')).toBe(false)
  })

  it('resets the page when the status filter changes', async () => {
    const user = userEvent.setup({ delay: null })
    render(<StudentFiltersBar filters={{}} groups={GROUPS} />)
    await user.selectOptions(screen.getAllByTestId('select')[0] as HTMLSelectElement, 'inactive')
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenLastCalledWith('/app/admin/students?status=inactive')
  })
})
