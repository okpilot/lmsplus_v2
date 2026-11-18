import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  removeCandidates: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('../actions/remove-candidates', () => ({ removeCandidates: m.removeCandidates }))
vi.mock('../actions/remove-entries', () => ({ removeSittingEntries: vi.fn() }))
vi.mock('../actions/issue-sitting-codes', () => ({ issueSittingCodes: vi.fn() }))
vi.mock('../actions/void-sitting-code', () => ({ voidSittingCode: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

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
  window.history.replaceState(null, '', '/app/admin/internal-exams/sittings/sit-1')
})

describe('PeopleSection layout', () => {
  it('has a People section titled with the candidate count', () => {
    ui({ summary: { ...summary, candidates: 12 } })
    expect(screen.getByRole('heading', { name: /People/ })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders one row per candidate in the given order', () => {
    ui()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Person 1')
    expect(rows[1]).toHaveTextContent('Person 2')
  })

  it('shows the PaginationBar only when total exceeds 50', () => {
    const { unmount } = ui({ total: 50 })
    expect(screen.queryByText(/of 50 people/)).toBeNull()
    unmount()
    ui({ total: 120 })
    expect(screen.getByText('Showing 1–50 of 120 people')).toBeInTheDocument()
  })

  it('shows the visible-page summary with people and exams', () => {
    ui()
    expect(screen.getByText('2 people · 2 exams')).toBeInTheDocument()
  })
})

describe('PeopleSection columns', () => {
  it('has checkbox, disclosure, Person, Exams, Status and actions columns when editable', () => {
    ui()
    const headers = screen.getAllByRole('columnheader')
    expect(headers).toHaveLength(6)
    expect(headers.map((h) => h.textContent)).toEqual([
      '',
      'Show exams',
      'Person',
      'Exams',
      'Status',
      'More actions',
    ])
    expect(screen.getByRole('checkbox', { name: 'Select Person 1' })).toBeInTheDocument()
  })

  it('has disclosure, Person, Exams and Status only when not editable, with no checkbox or menu', () => {
    ui({ editable: false, status: 'closed' })
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Show exams',
      'Person',
      'Exams',
      'Status',
    ])
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull()
  })
})

describe('PeopleSection person cell', () => {
  it('shows name as plain text with the email caption, no deactivated suffix', () => {
    ui({ rows: [person(1, { deactivated: true })] })
    expect(screen.getByText('Person 1')).toBeInTheDocument()
    expect(screen.getByText('p1@example.com')).toBeInTheDocument()
    expect(screen.queryByText(/\(deactivated\)/i)).toBeNull()
    expect(screen.getByText('Person 1').closest('button')).toBeNull()
  })

  it('falls back to the email when the name is blank', () => {
    ui({ rows: [person(1, { name: '' })] })
    expect(screen.getAllByText('p1@example.com').length).toBeGreaterThan(0)
  })
})

describe('PeopleSection exams cell', () => {
  it('shows No exams for a person without exams', () => {
    ui({ rows: [person(1, { entries: [] })] })
    expect(screen.getByText('No exams')).toBeInTheDocument()
  })

  it('shows the exam count and the subject-short list', () => {
    ui({
      rows: [
        person(1, {
          entries: [entry({ subjectShort: 'FPM' }), entry({ subjectShort: 'AGK' })],
        }),
      ],
    })
    expect(screen.getByText('2 exams')).toBeInTheDocument()
    expect(screen.getByText('FPM, AGK')).toBeInTheDocument()
  })
})

describe('PeopleSection disclosure', () => {
  it('toggles aria-expanded, aria-controls and the label', async () => {
    ui()
    const user = userEvent.setup()
    const btn = screen.getByRole('button', { name: 'Show exams for Person 1' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).not.toHaveAttribute('aria-controls')
    await user.click(btn)
    const open = screen.getByRole('button', { name: 'Hide exams for Person 1' })
    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(open).toHaveAttribute('aria-controls', 'detail-u1')
    expect(document.getElementById('detail-u1')).not.toBeNull()
  })

  it('keeps several rows open at once', async () => {
    ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Show exams for Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Show exams for Person 2' }))
    expect(document.getElementById('detail-u1')).not.toBeNull()
    expect(document.getElementById('detail-u2')).not.toBeNull()
  })

  it('keeps the open set when the filter changes', async () => {
    const user = userEvent.setup()
    const { rerender } = ui()
    await user.click(screen.getByRole('button', { name: 'Show exams for Person 1' }))
    rerender(
      <SittingUiProvider>
        <PeopleSection
          sittingId="sit-1"
          status="scheduled"
          editable
          summary={summary as never}
          rows={[person(1)] as never}
          total={1}
          q="person 1"
          show="all"
          page={1}
        />
      </SittingUiProvider>,
    )
    expect(document.getElementById('detail-u1')).not.toBeNull()
  })

  it('resets the open set on a page change', async () => {
    const user = userEvent.setup()
    const { rerender } = ui()
    await user.click(screen.getByRole('button', { name: 'Show exams for Person 1' }))
    rerender(
      <SittingUiProvider>
        <PeopleSection
          sittingId="sit-1"
          status="scheduled"
          editable
          summary={summary as never}
          rows={[person(1)] as never}
          total={120}
          q=""
          show="all"
          page={2}
        />
      </SittingUiProvider>,
    )
    expect(document.getElementById('detail-u1')).toBeNull()
  })
})

describe('PeopleSection expanded area', () => {
  async function open(over: Record<string, unknown> = {}) {
    ui(over)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show exams for Person 1' }))
  }

  it.each([
    [true, 'scheduled', '6'],
    [false, 'closed', '4'],
  ])(
    'renders one detail cell spanning the columns (editable=%s)',
    async (editable, status, span) => {
      await open({ editable, status })
      const cell = document.querySelector('#detail-u1 td')
      expect(cell).toHaveAttribute('colspan', span)
    },
  )

  it('shows the code with a copy button labelled for the exam and person', async () => {
    await open()
    const detail = document.getElementById('detail-u1') as HTMLElement
    expect(within(detail).getByText('ABCD1234')).toBeInTheDocument()
    expect(
      within(detail).getByRole('button', { name: 'Copy code for FPM, Person 1' }),
    ).toBeInTheDocument()
  })

  it('shows a dash instead of a code for a status without one', async () => {
    await open({
      rows: [person(1, { entries: [entry({ status: 'expired', code: null })] })],
    })
    const detail = document.getElementById('detail-u1') as HTMLElement
    expect(within(detail).getByText('—')).toBeInTheDocument()
    expect(within(detail).queryByRole('button', { name: /Copy code/ })).toBeNull()
  })

  it('shows the exam status label', async () => {
    await open({
      rows: [person(1, { entries: [entry({ status: 'discarded', code: null })] })],
    })
    expect(
      within(document.getElementById('detail-u1') as HTMLElement).getByText('Attempt discarded'),
    ).toBeInTheDocument()
  })

  it('says No exams yet. for a person without exams', async () => {
    await open({ rows: [person(1, { entries: [] })] })
    expect(screen.getByText('No exams yet.')).toBeInTheDocument()
  })

  it('states Codes valid until when all live codes share an expiry', async () => {
    await open()
    expect(screen.getByText(/Codes valid until /)).toBeInTheDocument()
  })

  it('omits Codes valid until when live codes expire at different times', async () => {
    await open({
      rows: [
        person(1, {
          entries: [
            entry({ codeExpiresAt: '2026-11-18T23:59:00Z' }),
            entry({ codeExpiresAt: '2026-11-19T23:59:00Z' }),
          ],
        }),
      ],
    })
    expect(screen.queryByText(/Codes valid until /)).toBeNull()
  })

  it('carries no email text', async () => {
    await open()
    expect(document.getElementById('detail-u1')?.textContent).not.toMatch(/mailed/i)
  })
})

describe('PeopleSection empty states', () => {
  it('says No people yet. for an empty unfiltered roster', () => {
    ui({ rows: [], total: 0 })
    expect(screen.getByText('No people yet.')).toBeInTheDocument()
  })

  it('says No match. for an empty search', () => {
    ui({ rows: [], total: 0, q: 'zzz' })
    expect(screen.getByText('No match.')).toBeInTheDocument()
  })

  it('says No one matches this filter. for an empty Show filter', () => {
    ui({ rows: [], total: 0, show: 'needs_code' })
    expect(screen.getByText('No one matches this filter.')).toBeInTheDocument()
  })
})

describe('PeopleSection selection', () => {
  it('ticks every shown row from the header checkbox', async () => {
    ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 shown' }))
    expect(screen.getByRole('checkbox', { name: 'Select Person 1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Person 2' })).toBeChecked()
  })

  it('shows the header checkbox as mixed when only some rows are ticked', async () => {
    ui()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.getByRole('checkbox', { name: 'Select all 2 shown' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    )
  })

  it('shows the selected count only when something is ticked', async () => {
    ui()
    expect(screen.queryByText(/selected/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.getByText(/1 selected/)).toBeInTheDocument()
  })

  it('shows the Remove bulk action once a row is ticked, and no Email action', async () => {
    ui()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Email/ })).toBeNull()
  })

  it('disables Remove above 100 ticks with Tick at most 100.', async () => {
    const rows = Array.from({ length: 101 }, (_, i) => person(i + 1))
    ui({ rows, total: 101 })
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select all 101 shown' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
    expect(screen.getByText(/Tick at most 100/)).toBeInTheDocument()
  })
})

describe('PeopleSection remove people', () => {
  async function tickAndRemove() {
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    return { user, dialog: await screen.findByRole('alertdialog') }
  }

  it('opens the confirm with the spec copy for the bulk Remove', async () => {
    ui()
    const { dialog } = await tickAndRemove()
    expect(within(dialog).getByText('Remove 1 person?')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        'Their exams are removed and unused codes voided. Anyone who has taken an exam cannot be removed.',
      ),
    ).toBeInTheDocument()
  })

  it('removes the ticked people and toasts Removed {n}.', async () => {
    m.removeCandidates.mockResolvedValue({
      success: true,
      removed: 1,
      entriesRemoved: 1,
      codesVoided: 1,
    })
    ui()
    const { user, dialog } = await tickAndRemove()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(m.removeCandidates).toHaveBeenCalledWith({ sittingId: 'sit-1', userIds: ['u1'] }),
    )
    await waitFor(() =>
      expect(m.toastSuccess).toHaveBeenCalledWith('Removed 1.', expect.anything()),
    )
  })

  it('unticks only the removed people after success', async () => {
    m.removeCandidates.mockResolvedValue({
      success: true,
      removed: 1,
      entriesRemoved: 1,
      codesVoided: 1,
    })
    ui({ rows: [person(1), person(2), person(3)], total: 3 })
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 2' }))
    await user.click(screen.getByRole('button', { name: 'Actions for Person 3' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from sitting' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(m.removeCandidates).toHaveBeenCalledWith({ sittingId: 'sit-1', userIds: ['u3'] }),
    )
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled())
    expect(screen.getByRole('checkbox', { name: 'Select Person 1' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Person 2' })).toBeChecked()
  })

  it('unticks the removed people after a bulk remove', async () => {
    m.removeCandidates.mockResolvedValue({
      success: true,
      removed: 2,
      entriesRemoved: 2,
      codesVoided: 2,
    })
    ui({ rows: [person(1), person(2)] })
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 2' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled())
    expect(screen.getByRole('checkbox', { name: 'Select Person 1' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Person 2' })).not.toBeChecked()
  })

  it('opens the same confirm from the row menu with Remove from sitting', async () => {
    ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Person 2' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from sitting' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Remove 1 person?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(m.removeCandidates).toHaveBeenCalledWith({ sittingId: 'sit-1', userIds: ['u2'] }),
    )
  })

  it('shows the candidate_has_attempt message in the dialog and keeps it open', async () => {
    const msg =
      'Someone you selected has taken an exam. History is permanent: they cannot be removed.'
    m.removeCandidates.mockResolvedValue({ success: false, error: msg })
    ui()
    const { user, dialog } = await tickAndRemove()
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(await within(dialog).findByText(msg)).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('offers only Remove from sitting in the person menu (no Email items)', async () => {
    ui()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Actions for Person 1' }))
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent)
    expect(items).toContain('Remove from sitting')
    expect(items.some((t) => /Email/.test(t ?? ''))).toBe(false)
  })
})

describe('PeopleSection section actions', () => {
  it('never renders Email all codes', () => {
    ui({ summary: { ...summary, entriesIssuable: 3 } })
    expect(screen.queryByRole('button', { name: /Email all codes/ })).toBeNull()
  })
})
