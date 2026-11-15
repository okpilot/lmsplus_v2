import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockPush }),
  usePathname: () => '/app/admin/students',
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
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/app/admin/students')
})

afterEach(() => {
  vi.useRealTimers()
})

function typeSearch(text: string) {
  fireEvent.change(screen.getByPlaceholderText('Search students...'), { target: { value: text } })
}

function chooseStatus(value: string) {
  fireEvent.change(screen.getAllByTestId('select')[0] as HTMLElement, { target: { value } })
}

describe('StudentFiltersBar pending search', () => {
  it('carries typed search into a filter change made before the debounce fires', () => {
    render(<StudentFiltersBar filters={{}} groups={[]} />)
    typeSearch(' ann ')
    chooseStatus('active')
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/students?status=active&search=ann')
  })

  it('does not fire a second replace after the debounce window', () => {
    render(<StudentFiltersBar filters={{}} groups={[]} />)
    typeSearch('ann')
    chooseStatus('active')
    vi.advanceTimersByTime(500)
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/students?status=active&search=ann')
  })

  it('sends no search key when no typing is pending', () => {
    window.history.replaceState(null, '', '/app/admin/students?search=bob')
    render(<StudentFiltersBar filters={{ search: 'bob' }} groups={[]} />)
    chooseStatus('active')
    expect(mockPush).toHaveBeenCalledWith('/app/admin/students?search=bob&status=active')
  })
})
