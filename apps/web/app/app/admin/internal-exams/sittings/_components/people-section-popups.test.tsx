import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: '' }))
vi.mock('../../actions/send-code-email', () => ({ sendInternalExamCodeEmail: vi.fn() }))
vi.mock('../actions/email-sitting-codes', () => ({ emailSittingCodes: vi.fn() }))
vi.mock('../actions/remove-candidates', () => ({ removeCandidates: vi.fn() }))
vi.mock('../actions/remove-entries', () => ({ removeSittingEntries: vi.fn() }))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: vi.fn() }))
vi.mock('../actions/void-sitting-code', () => ({ voidSittingCode: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: m.replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(m.search),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { PeopleSection } from './people-section'

const entry = (over: Record<string, unknown> = {}) => ({
  entryId: `e-${Math.random()}`,
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
const person = (n: number, over: Record<string, unknown> = {}) => ({
  userId: `u${n}`,
  name: `Person ${n}`,
  email: `p${n}@example.com`,
  deactivated: false,
  hasAttempt: false,
  entries: [entry({ entryId: `e${n}` })],
  ...over,
})
const summary = {
  status: 'scheduled',
  candidates: 2,
  deactivatedCandidates: 0,
  entries: 2,
  codesIssued: 2,
  entriesIssuable: 0,
  entriesWithAttempt: 0,
  pendingRemovalNotices: 0,
  dayEnded: false,
}

function ui(over: Record<string, unknown> = {}) {
  return render(
    <SittingUiProvider>
      <PeopleSection
        sittingId="sit-1"
        status="scheduled"
        editable
        summary={summary as never}
        rows={[person(1), person(2)] as never}
        total={2}
        q=""
        show="all"
        page={1}
        {...(over as object)}
      />
    </SittingUiProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  m.search = ''
})

describe('PeopleSection section actions (AC 44, 51)', () => {
  it('shows Add people for an editable sitting', () => {
    ui()
    expect(screen.getByRole('button', { name: 'Add people' })).toBeInTheDocument()
  })

  it('shows Issue all codes with the issuable count only when above zero', () => {
    const { unmount } = ui({ summary: { ...summary, entriesIssuable: 3 } })
    expect(screen.getByRole('button', { name: 'Issue all codes (3)' })).toBeInTheDocument()
    unmount()
    ui()
    expect(screen.queryByRole('button', { name: /Issue all codes/ })).toBeNull()
  })

  it('renders neither action nor bulk Add exams when not editable', () => {
    ui({ editable: false, summary: { ...summary, entriesIssuable: 3 } })
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Issue all codes/ })).toBeNull()
  })

  it('opens the Add people popup from the section action', async () => {
    ui()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add people' }))
    expect(m.push.mock.calls[0]?.[0]).toContain('dlg=people')
  })

  it('opens Issue with no selection params from Issue all codes', async () => {
    ui({ summary: { ...summary, entriesIssuable: 3 } })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Issue all codes (3)' }))
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=issue')
    expect(href).not.toContain('ids=')
    expect(href).not.toContain('all=1')
  })

  it('adds a primary Add people button to the unfiltered empty state', () => {
    ui({ rows: [], total: 0, summary: { ...summary, candidates: 0 } })
    expect(screen.getByText('No people yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add people' })).toHaveLength(2)
  })
})

describe('PeopleSection bulk Add exams and Issue codes (AC 44, 46)', () => {
  it('shows bulk Add exams and Issue codes once a row is ticked', async () => {
    ui()
    expect(screen.queryByRole('button', { name: 'Add exams' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Issue codes' })).toBeInTheDocument()
  })

  it('opens Add exams with the ticked ids', async () => {
    ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=exams')
    expect(href).toContain('ids=u1')
  })
})

describe('PeopleSection Select all (AC 29, 15b)', () => {
  const many = { summary: { ...summary, candidates: 120 }, total: 120 }

  it('offers Select all {candidates} after the whole page is ticked', async () => {
    ui(many)
    expect(screen.queryByText(/Select all 120/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select all 2 selectable' }))
    expect(screen.getByText(/Select all 120/)).toBeInTheDocument()
  })

  it('does not offer Select all 120 while a search is active', async () => {
    ui({ ...many, q: 'pers' })
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select all 2 selectable' }))
    expect(screen.queryByText(/Select all 120/)).toBeNull()
  })

  it('enters all-mode: caption, checked rows, Remove disabled with the clear hint', async () => {
    ui(many)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 selectable' }))
    await user.click(screen.getByText(/Select all 120/))
    expect(screen.getByText('All 120 selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select Person 1' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByText('Clear select-all to remove people.')).toBeInTheDocument()
  })

  it('leaves all-mode with no ticks when a row is toggled', async () => {
    ui(many)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 selectable' }))
    await user.click(screen.getByText(/Select all 120/))
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.queryByText('All 120 selected')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Select Person 2' })).not.toBeChecked()
  })

  it('says Tick at most 100, or select all. above 100 unfiltered ticks', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => person(i + 1))
    ui({ rows, total: 101, summary: { ...summary, candidates: 101 } })
    await userEvent
      .setup()
      .click(screen.getByRole('checkbox', { name: 'Select all 101 selectable' }))
    expect(screen.getByText(/Tick at most 100, or select all\./)).toBeInTheDocument()
  })
})
