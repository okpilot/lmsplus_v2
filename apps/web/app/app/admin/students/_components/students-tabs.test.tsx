import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSearch } = vi.hoisted(() => ({ mockSearch: { value: '' } }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))

import { StudentsTabs } from './students-tabs'

function setup(search: string) {
  mockSearch.value = search
  return render(
    <StudentsTabs students={<div>students-content</div>} groups={<div>groups-content</div>} />,
  )
}

let replaceState: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('StudentsTabs', () => {
  it('AC2: shows Students and Groups tabs', () => {
    setup('')
    expect(screen.getByRole('tab', { name: 'Students' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Groups' })).toBeInTheDocument()
  })

  it('AC2: no tab param selects Students', () => {
    setup('status=active')
    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'false')
  })

  it('AC2: an unknown tab value selects Students', () => {
    setup('tab=bogus')
    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'true')
  })

  it('AC2: tab=groups selects Groups', () => {
    setup('tab=groups')
    expect(screen.getByRole('tab', { name: 'Groups' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Students' })).toHaveAttribute('aria-selected', 'false')
  })

  it('AC3: clicking Groups writes ?tab=groups via replaceState keeping other params', async () => {
    const user = userEvent.setup({ delay: null })
    setup('status=active')
    await user.click(screen.getByRole('tab', { name: 'Groups' }))
    expect(replaceState).toHaveBeenCalled()
    const url = String(replaceState.mock.calls.at(-1)?.[2])
    const p = new URLSearchParams(url.split('?')[1])
    expect(p.get('tab')).toBe('groups')
    expect(p.get('status')).toBe('active')
  })

  it('AC3: clicking Students removes tab keeping other params', async () => {
    const user = userEvent.setup({ delay: null })
    setup('tab=groups&status=active')
    await user.click(screen.getByRole('tab', { name: 'Students' }))
    const url = String(replaceState.mock.calls.at(-1)?.[2])
    const p = new URLSearchParams(url.split('?')[1])
    expect(p.has('tab')).toBe(false)
    expect(p.get('status')).toBe('active')
  })

  it('AC3: both panels stay mounted (keepMounted)', () => {
    setup('')
    expect(screen.getByText('students-content')).toBeInTheDocument()
    expect(screen.getByText('groups-content')).toBeInTheDocument()
  })
})
