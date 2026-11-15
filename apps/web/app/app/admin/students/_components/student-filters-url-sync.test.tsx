import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }))

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
    items?: { value: string; label: string }[]
  }) => (
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => <button type="button" />,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { StudentFiltersBar } from './student-filters'

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/app/admin/students?page=2')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('StudentFiltersBar URL sync', () => {
  it('does not touch the URL after a page change without typing', () => {
    vi.useFakeTimers()
    const { rerender } = render(<StudentFiltersBar filters={{}} groups={[]} />)
    window.history.replaceState(null, '', '/app/admin/students?page=3')
    rerender(<StudentFiltersBar filters={{}} groups={[]} />)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('Clear resets the input and does not re-apply the search', async () => {
    const user = userEvent.setup({ delay: null })
    window.history.replaceState(null, '', '/app/admin/students?search=alice&page=2')
    const { rerender } = render(<StudentFiltersBar filters={{ search: 'alice' }} groups={[]} />)
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByPlaceholderText('Search students...')).toHaveValue('')
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/students')
    mockReplace.mockClear()
    rerender(<StudentFiltersBar filters={{}} groups={[]} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('status change sends page: null', async () => {
    const user = userEvent.setup({ delay: null })
    render(<StudentFiltersBar filters={{}} groups={[]} />)
    await user.selectOptions(screen.getAllByTestId('select')[0] as HTMLSelectElement, 'inactive')
    const url = String(mockReplace.mock.calls.at(-1)?.[0])
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('status')).toBe('inactive')
    expect(params.has('page')).toBe(false)
  })
})
