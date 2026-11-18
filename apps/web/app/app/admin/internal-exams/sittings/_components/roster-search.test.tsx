import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))

import { RosterSearch } from './roster-search'

beforeEach(() => {
  vi.useFakeTimers()
  mockReplace.mockReset()
  window.history.replaceState(null, '', '/x?page=4&show=needs_code')
})
afterEach(() => vi.useRealTimers())

describe('RosterSearch', () => {
  it('limits the input to 100 characters', () => {
    render(<RosterSearch value="" />)
    expect(screen.getByLabelText('Search people in this sitting')).toHaveAttribute(
      'maxlength',
      '100',
    )
  })

  it('writes q after a 300 ms debounce and clears page', () => {
    render(<RosterSearch value="" />)
    fireEvent.change(screen.getByLabelText('Search people in this sitting'), {
      target: { value: 'ann' },
    })
    vi.advanceTimersByTime(299)
    expect(mockReplace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    const url = mockReplace.mock.calls[0]?.[0] as string
    expect(url).toContain('q=ann')
    expect(url).toContain('show=needs_code')
    expect(url).not.toContain('page=')
  })

  it('debounces: only the last of quick edits reaches the URL', () => {
    render(<RosterSearch value="" />)
    const box = screen.getByLabelText('Search people in this sitting')
    fireEvent.change(box, { target: { value: 'a' } })
    vi.advanceTimersByTime(100)
    fireEvent.change(box, { target: { value: 'an' } })
    vi.advanceTimersByTime(400)
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls[0]?.[0] as string).toContain('q=an')
  })
})
