import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import type { RosterEntry, RosterRow } from '../types'
import { PersonRow } from './person-row'

const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  entryId: 'e1',
  subjectId: 's1',
  subjectShort: 'FPM',
  subjectName: 'Flight Performance',
  courseId: 'c1',
  courseName: 'PPL',
  status: 'ready',
  attemptNumber: null,
  passed: null,
  score: null,
  codeId: 'k1',
  code: 'ABCD1234',
  codeExpiresAt: '2026-11-18T23:59:00Z',
  codeEmailedAt: null,
  voidReason: null,
  sessionId: null,
  sessionStartedAt: null,
  ...over,
})

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  userId: 'u1',
  name: 'Ann Pilot',
  email: 'ann@example.com',
  deactivated: false,
  hasAttempt: false,
  entries: [entry()],
  ...over,
})

function ui(over: Partial<Parameters<typeof PersonRow>[0]> = {}) {
  const props = { onToggle: vi.fn(), onRemove: vi.fn() }
  render(
    <SittingUiProvider>
      <table>
        <tbody>
          <PersonRow
            sittingId="sit-1"
            sittingStatus="scheduled"
            row={row()}
            editable
            open={false}
            {...props}
            {...over}
          />
        </tbody>
      </table>
    </SittingUiProvider>,
  )
  return props
}

describe('PersonRow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('says No exams once and shows no status for a person without exams', () => {
    ui({ row: row({ entries: [] }) })
    expect(screen.getAllByText('No exams')).toHaveLength(1)
  })

  it('shows the Deactivated status for a deactivated person without exams', () => {
    ui({ row: row({ entries: [], deactivated: true }) })
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  it('falls back to the email as the name when the name is blank', () => {
    ui({ row: row({ name: '' }) })
    expect(screen.getByRole('checkbox', { name: 'Select ann@example.com' })).toBeInTheDocument()
  })

  it('calls onToggle from the disclosure button', async () => {
    const { onToggle } = ui()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show exams for Ann Pilot' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('renders the expanded exams only when open', () => {
    ui({ open: true })
    expect(screen.getByRole('button', { name: 'Hide exams for Ann Pilot' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(document.getElementById('detail-u1')).not.toBeNull()
  })

  it('omits the tick and the actions menu when not editable', () => {
    ui({ editable: false })
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Actions for Ann Pilot' })).toBeNull()
  })

  it('disables the tick and offers Add exams but no Remove for a person who has taken an exam (AC 53)', async () => {
    ui({ row: row({ hasAttempt: true }) })
    expect(screen.getByRole('checkbox', { name: 'Select Ann Pilot' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    expect(await screen.findByRole('menuitem', { name: 'Add exams' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Remove from sitting' })).toBeNull()
  })

  it('offers Issue codes only for a needs-code, active person (AC 44, 53)', async () => {
    const user = userEvent.setup()
    ui({ row: row({ entries: [entry({ status: 'no_code', codeId: null, code: null })] }) })
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    expect(await screen.findByRole('menuitem', { name: 'Issue codes' })).toBeInTheDocument()
  })

  it('disables every row action while a navigation is refreshing', async () => {
    m.push.mockImplementation(() => new Promise<void>(() => undefined))
    const user = userEvent.setup()
    ui({ row: row({ entries: [entry({ status: 'no_code', codeId: null, code: null })] }) })
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Issue codes' }))
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    expect(await screen.findByRole('menuitem', { name: 'Issue codes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    for (const name of ['Add exams', 'Remove from sitting']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('omits Issue codes when every exam already has a code (AC 44)', async () => {
    ui()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    expect(await screen.findByRole('menuitem', { name: 'Add exams' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Issue codes' })).toBeNull()
  })

  it('keeps a ticked person with an attempt untickable', async () => {
    const toggle = { onToggle: vi.fn(), onRemove: vi.fn() }
    const tree = (hasAttempt: boolean) => (
      <SittingUiProvider>
        <table>
          <tbody>
            <PersonRow
              sittingId="sit-1"
              sittingStatus="scheduled"
              row={row({ hasAttempt })}
              editable
              open={false}
              {...toggle}
            />
          </tbody>
        </table>
      </SittingUiProvider>
    )
    const user = userEvent.setup()
    const { rerender } = render(tree(false))
    await user.click(screen.getByRole('checkbox', { name: 'Select Ann Pilot' }))
    rerender(tree(true))
    const box = screen.getByRole('checkbox', { name: 'Select Ann Pilot' })
    expect(box).not.toHaveAttribute('aria-disabled', 'true')
    expect(box).toBeChecked()
    await user.click(box)
    expect(screen.getByRole('checkbox', { name: 'Select Ann Pilot' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Ann Pilot' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('calls onRemove from the row menu', async () => {
    const { onRemove } = ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Ann Pilot' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from sitting' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
