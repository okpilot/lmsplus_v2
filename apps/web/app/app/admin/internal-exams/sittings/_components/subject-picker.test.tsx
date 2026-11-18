import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ add: vi.fn(), replace: vi.fn(), success: vi.fn() }))
vi.mock('../actions/add-exams', () => ({ addSittingExams: m.add }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=exams'),
}))
vi.mock('sonner', () => ({ toast: { success: m.success, error: vi.fn() } }))
vi.mock('./option-select', () => ({
  OptionSelect: (p: {
    label: string
    value: string
    options: { value: string; label: string }[]
    onChange: (v: string) => void
  }) => (
    <select aria-label={p.label} value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'
import { ResultBanner } from './result-banner'
import { SubjectPicker } from './subject-picker'

const subj = (id: string, short: string, over: Record<string, unknown> = {}) => ({
  subjectId: id,
  subjectName: `${short} full`,
  subjectShort: short,
  courseId: 'c1',
  courseName: 'PPL',
  people: 2,
  eligible: 2,
  enteredHere: 0,
  passed: 0,
  attemptRunning: 0,
  enteredElsewhere: 0,
  notEnrolled: 0,
  deactivated: 0,
  state: null,
  attemptCount: null,
  passedAt: null,
  passedScore: null,
  elsewhereSittingId: null,
  elsewhereAt: null,
  ...over,
})
const U = '00000000-0000-4000-a000-0000000000c1'

function Probe() {
  return <p data-testid="probe">{useSittingUi().locked ? 'locked' : 'free'}</p>
}

function picker(over: Record<string, unknown> = {}) {
  const props = {
    sittingId: 's1',
    rows: [subj('a1', 'FPM'), subj('b1', 'NAV', { courseId: 'c2', courseName: 'ATPL' })],
    userIds: [U, 'u2'],
    peopleCount: 2,
    singleDeactivated: false,
    sameDay: [],
    ...over,
  }
  return render(
    <SittingUiProvider>
      <Probe />
      <ResultBanner />
      <DialogShell>
        <SubjectPicker {...(props as unknown as Parameters<typeof SubjectPicker>[0])} />
      </DialogShell>
    </SittingUiProvider>,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('SubjectPicker', () => {
  it('only exams someone can sit have a checkbox; a header checkbox exists (AC 37)', () => {
    picker({ rows: [subj('a1', 'FPM'), subj('b1', 'NAV', { eligible: 0, passed: 2 })] })
    expect(screen.getByRole('checkbox', { name: 'Add FPM' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Add NAV' })).toBeNull()
    expect(screen.getByText('0 of 2 can sit')).toBeInTheDocument()
    expect(screen.getByText('2 passed')).toBeInTheDocument()
  })

  it('has no header checkbox when nothing is tickable (AC 37)', () => {
    picker({ rows: [subj('a1', 'FPM', { eligible: 0, notEnrolled: 2 })] })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('single person: shows the pair state text and only eligible rows tick (AC 36)', () => {
    picker({
      peopleCount: 1,
      userIds: [U],
      rows: [
        subj('a1', 'FPM', { people: 1, eligible: 1, state: 'eligible' }),
        subj('b1', 'NAV', { people: 1, eligible: 0, notEnrolled: 1, state: 'not_enrolled' }),
      ],
    })
    expect(screen.getByText('Not enrolled')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Add NAV' })).toBeNull()
  })

  it('a deactivated single person cannot be entered (AC 36)', () => {
    picker({
      peopleCount: 1,
      userIds: [U],
      singleDeactivated: true,
      rows: [subj('a1', 'FPM', { people: 1, eligible: 0, deactivated: 1, state: 'deactivated' })],
    })
    expect(screen.getByText('Deactivated students cannot be entered.')).toBeInTheDocument()
  })

  it('filters by search text and by course on the client', async () => {
    const user = userEvent.setup()
    picker()
    await user.type(screen.getByLabelText('Search exams'), 'nav')
    expect(screen.queryByRole('checkbox', { name: 'Add FPM' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Add NAV' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search exams'))
    await user.selectOptions(screen.getByLabelText('Course'), 'c1')
    expect(screen.queryByRole('checkbox', { name: 'Add NAV' })).toBeNull()
    await user.type(screen.getByLabelText('Search exams'), 'zzz')
    expect(screen.getByText('No exams match.')).toBeInTheDocument()
  })

  it('shows the same-day line (AC 40)', () => {
    picker({
      sameDay: [{ userId: 'u1', name: 'Ann', sittingId: 'x', scheduledAt: '2026-11-18T09:30:00Z' }],
    })
    expect(
      screen.getByText('Ann is also in another sitting that day (09:30 UTC).'),
    ).toBeInTheDocument()
  })

  it('footer counts the exams and disables Add above 1000 (AC 38)', async () => {
    const user = userEvent.setup()
    picker({ peopleCount: 600 })
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 exam for 600 people')
    await user.click(screen.getByRole('checkbox', { name: 'Add NAV' }))
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeDisabled()
    expect(screen.getByText(/Too many: 600 people x 2 exams = 1200/)).toBeInTheDocument()
  })

  it('the header checkbox ticks every tickable exam and unticks them again', async () => {
    const user = userEvent.setup()
    picker()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 shown' }))
    expect(screen.getByRole('status')).toHaveTextContent('2 exams for 2 people')
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 shown' }))
    expect(screen.getByRole('status')).not.toHaveTextContent('2 exams')
  })

  it('sends all people x the chosen exams, closes, and toasts the plain success (AC 39)', async () => {
    m.add.mockResolvedValue({ success: true, added: 2, skippedTotal: 0, skipped: [] })
    const user = userEvent.setup()
    picker()
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    expect(m.add).toHaveBeenCalledWith({ sittingId: 's1', subjectIds: ['a1'], userIds: [U, 'u2'] })
    await waitFor(() => expect(m.replace).toHaveBeenCalled())
    expect(m.success).toHaveBeenCalledWith('Added 2 exams.', undefined)
  })

  it('sends all:true in all-mode (AC 41)', async () => {
    m.add.mockResolvedValue({ success: true, added: 1, skippedTotal: 0, skipped: [] })
    const user = userEvent.setup()
    picker({ userIds: undefined })
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    expect(m.add).toHaveBeenCalledWith({ sittingId: 's1', subjectIds: ['a1'], all: true })
  })

  it('lists skipped pairs in a caution banner with the subject short from the rows (AC 39)', async () => {
    m.add.mockResolvedValue({
      success: true,
      added: 1,
      skippedTotal: 1,
      skipped: [{ person: 'Bob', subjectId: 'a1', reason: 'not_enrolled' }],
    })
    const user = userEvent.setup()
    picker()
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    expect(await screen.findByText('Bob · FPM: not enrolled')).toBeInTheDocument()
    expect(m.success).not.toHaveBeenCalled()
  })

  it('keeps the popup open and shows the error inside it (AC 47)', async () => {
    m.add.mockResolvedValue({
      success: false,
      error: 'An exam you picked no longer exists. Reload and try again.',
    })
    const user = userEvent.setup()
    picker()
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer exists')
    expect(m.replace).not.toHaveBeenCalled()
  })

  it('locks the popup while Add exams runs (AC 47)', async () => {
    let done: (v: unknown) => void = () => undefined
    m.add.mockReturnValue(new Promise((r) => (done = r)))
    const user = userEvent.setup()
    picker()
    await user.click(screen.getByRole('checkbox', { name: 'Add FPM' }))
    await user.click(screen.getByRole('button', { name: 'Add exams' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('locked')
    await act(async () => done({ success: true, added: 1, skippedTotal: 0, skipped: [] }))
    expect(screen.getByTestId('probe')).toHaveTextContent('free')
  })
})
