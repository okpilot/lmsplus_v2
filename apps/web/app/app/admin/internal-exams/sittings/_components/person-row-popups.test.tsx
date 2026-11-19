import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('../../actions/send-code-email', () => ({ sendInternalExamCodeEmail: vi.fn() }))
vi.mock('../actions/email-sitting-codes', () => ({ emailSittingCodes: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import type { RosterEntry, RosterRow } from '../types'
import { RosterTable } from './roster-table'

const entry = (status: RosterEntry['status']): RosterEntry =>
  ({
    entryId: `e-${status}`,
    subjectId: 's1',
    subjectShort: 'FPM',
    subjectName: 'F',
    status,
  }) as never

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  userId: 'u1',
  name: 'Ann Pilot',
  email: 'ann@example.com',
  deactivated: false,
  hasAttempt: false,
  entries: [entry('no_code')],
  ...over,
})

function Seed({ ids, all }: Readonly<{ ids: string[]; all: boolean }>) {
  const { setRosterPage, setSelectAll } = useSittingUi()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    if (all) setSelectAll(true)
    else setRosterPage(ids, true)
  }, [ids, all, setRosterPage, setSelectAll])
  return null
}

function ui(rows: RosterRow[], selection = { ids: [] as string[], all: false }) {
  render(
    <SittingUiProvider>
      <Seed {...selection} />
      <RosterTable
        sittingId="sit-1"
        sittingStatus="scheduled"
        rows={rows}
        editable
        q=""
        show="all"
        onRemove={vi.fn()}
      />
    </SittingUiProvider>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('person row menu opens the popups (AC 44, 46)', () => {
  it('opens Add exams for that person', async () => {
    ui([row()])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add exams' }))
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=exams')
    expect(href).toContain('ids=u1')
  })

  it('opens Issue for that person when an exam needs a code', async () => {
    ui([row()])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Issue codes' }))
    expect(String(m.push.mock.calls[0]?.[0])).toMatch(/dlg=issue.*ids=u1|ids=u1.*dlg=issue/)
  })

  it('offers no Issue codes for a deactivated person', async () => {
    ui([row({ deactivated: true })])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    expect(await screen.findByRole('menuitem', { name: 'Add exams' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Issue codes' })).toBeNull()
  })
})

describe('roster table in all-mode (AC 29, 53)', () => {
  it('renders the header and every row checked; an attempt holder stays disabled', () => {
    ui([row(), row({ userId: 'u2', name: 'Bob Flyer', hasAttempt: true })], { ids: [], all: true })
    expect(screen.getByRole('checkbox', { name: 'Select all 1 shown' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Ann Pilot' })).toBeChecked()
    const bob = screen.getByRole('checkbox', { name: 'Select Bob Flyer' })
    expect(bob).toBeChecked()
    expect(bob).toHaveAttribute('aria-disabled', 'true')
  })
})
