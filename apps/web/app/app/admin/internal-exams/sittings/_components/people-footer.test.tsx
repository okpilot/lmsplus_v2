import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PeopleFooter } from './people-footer'

const base = {
  ticked: 0,
  group: null,
  pending: false,
  busy: false,
  onAddSelected: vi.fn(),
  onAddGroup: vi.fn(),
  onClear: vi.fn(),
}
const footer = (over: Record<string, unknown> = {}) =>
  render(<PeopleFooter {...base} {...(over as object)} />)
const group = { id: 'g1', name: 'Group A', activeNew: 3, deactivatedNew: 1 }

describe('PeopleFooter', () => {
  it('always renders the status region; Add selected is disabled at zero', () => {
    footer()
    expect(screen.getByRole('status')).toHaveTextContent('No one selected')
    expect(screen.getByRole('button', { name: 'Add selected (0)' })).toBeDisabled()
  })

  it('counts the ticks and enables Add selected up to 500 (AC 33)', async () => {
    const onAddSelected = vi.fn()
    footer({ ticked: 500, onAddSelected })
    expect(screen.getByRole('status')).toHaveTextContent('500 selected')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add selected (500)' }))
    expect(onAddSelected).toHaveBeenCalled()
  })

  it('disables Add selected above 500 and says why', () => {
    footer({ ticked: 501 })
    expect(screen.getByRole('button', { name: 'Add selected (501)' })).toBeDisabled()
    expect(screen.getByText('Add at most 500 at once')).toBeInTheDocument()
  })

  it('shows the group button with its counts and sends it on click (AC 34)', async () => {
    const onAddGroup = vi.fn()
    footer({ group, onAddGroup })
    const btn = screen.getByRole('button', {
      name: 'Add whole group "Group A" (3 new, 1 deactivated skipped)',
    })
    await userEvent.setup().click(btn)
    expect(onAddGroup).toHaveBeenCalled()
  })

  it('disables the group button when nobody new would be added', () => {
    footer({ group: { ...group, activeNew: 0, deactivatedNew: 2 } })
    expect(screen.getByRole('button', { name: /Add whole group/ })).toBeDisabled()
  })

  it('disables the Add buttons while refreshing or pending (AC 48)', () => {
    footer({ ticked: 2, group, busy: true })
    expect(screen.getByRole('button', { name: 'Add selected (2)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Add whole group/ })).toBeDisabled()
  })

  it('Clear calls onClear', async () => {
    const onClear = vi.fn()
    footer({ ticked: 1, onClear })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })
})
