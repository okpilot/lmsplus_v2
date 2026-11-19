import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../actions/send-code-email', () => ({ sendInternalExamCodeEmail: vi.fn() }))
vi.mock('../actions/email-sitting-codes', () => ({ emailSittingCodes: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import type { RosterRow, ShowValue } from '../types'
import { RosterTable } from './roster-table'

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  userId: 'u1',
  name: 'Ann Pilot',
  email: 'ann@example.com',
  deactivated: false,
  hasAttempt: false,
  entries: [],
  ...over,
})

function ui(rows: RosterRow[], over: { q?: string; show?: ShowValue; editable?: boolean } = {}) {
  const onRemove = vi.fn()
  render(
    <SittingUiProvider>
      <RosterTable
        sittingId="sit-1"
        sittingStatus="scheduled"
        rows={rows}
        editable={over.editable ?? true}
        q={over.q ?? ''}
        show={over.show ?? 'all'}
        onRemove={onRemove}
      />
    </SittingUiProvider>,
  )
  return { onRemove }
}

describe('RosterTable', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows "No people yet." for an empty roster with no filter', () => {
    ui([])
    expect(screen.getByText('No people yet.')).toBeInTheDocument()
  })

  it('shows "No match." for an empty result when a search is set', () => {
    ui([], { q: 'zzz', show: 'needs_code' })
    expect(screen.getByText('No match.')).toBeInTheDocument()
  })

  it('shows "No one matches this filter." for an empty result under a Show filter', () => {
    ui([], { show: 'attempts' })
    expect(screen.getByText('No one matches this filter.')).toBeInTheDocument()
  })

  it('select-all ticks every selectable person and skips people with an attempt', async () => {
    ui([
      row({ userId: 'u1', name: 'Ann' }),
      row({ userId: 'u2', name: 'Bob' }),
      row({ userId: 'u3', name: 'Cy', hasAttempt: true }),
    ])
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all 2 shown' }))
    expect(screen.getByRole('checkbox', { name: 'Select Ann' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Cy' })).not.toBeChecked()
  })

  it('select-all unticks everyone on a second click', async () => {
    ui([row({ userId: 'u1', name: 'Ann' }), row({ userId: 'u2', name: 'Bob' })])
    const all = screen.getByRole('checkbox', { name: 'Select all 2 shown' })
    await userEvent.click(all)
    await userEvent.click(all)
    expect(screen.getByRole('checkbox', { name: 'Select Ann' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).not.toBeChecked()
  })

  it('disables select-all when every person has an attempt', () => {
    ui([row({ userId: 'u1', name: 'Ann', hasAttempt: true })])
    expect(screen.getByRole('checkbox', { name: 'Select all 0 shown' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('hides tick boxes when not editable', () => {
    ui([row()], { editable: false })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('toggles one person open and closed without affecting the others', async () => {
    ui([row({ userId: 'u1', name: 'Ann' }), row({ userId: 'u2', name: 'Bob' })])
    await userEvent.click(screen.getByRole('button', { name: 'Show exams for Ann' }))
    expect(screen.getByRole('button', { name: 'Hide exams for Ann' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Show exams for Bob' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Hide exams for Ann' }))
    expect(screen.getByRole('button', { name: 'Show exams for Ann' })).toBeInTheDocument()
  })

  it('removes exactly the row whose menu item was chosen', async () => {
    const { onRemove } = ui([
      row({ userId: 'u1', name: 'Ann' }),
      row({ userId: 'u2', name: 'Bob' }),
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Bob' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from sitting' }))
    expect(onRemove).toHaveBeenCalledWith(['u2'])
  })
})
