import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  start: vi.fn(),
  close: vi.fn(),
  cancel: vi.fn(),
  refresh: vi.fn(),
  setConfirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  issueNow: vi.fn(),
}))
vi.mock('../actions/start-sitting', () => ({ startSitting: m.start }))
vi.mock('../actions/close-sitting', () => ({ closeSitting: m.close }))
vi.mock('../actions/cancel-sitting', () => ({ cancelSitting: m.cancel }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: m.refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { type Confirm, LifecycleConfirms } from './lifecycle-confirms'

const sitting = {
  id: 'sit-1',
  status: 'scheduled',
  scheduledAt: '2026-11-18T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: 'inv-1',
  invigilatorName: 'Ann',
  invigilatorActive: true,
}
const summary = {
  attemptsRunning: 0,
  entriesNotStarted: 0,
  studentsNotStarted: 0,
  entriesWithoutCode: 0,
  entriesIssuable: 0,
}

function ui(confirm: Confirm, s: Record<string, unknown> = summary) {
  return render(
    <LifecycleConfirms
      sitting={sitting as never}
      summary={s as never}
      confirm={confirm}
      setConfirm={m.setConfirm}
      onIssueNow={m.issueNow}
    />,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('LifecycleConfirms', () => {
  it('starts the sitting, closes the dialog, toasts the restamped code count', async () => {
    m.start.mockResolvedValue({ success: true, codesRestamped: 3 })
    ui('start')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start sitting' }))
    await waitFor(() => expect(m.setConfirm).toHaveBeenCalledWith(null))
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.start).toHaveBeenCalledWith({ sittingId: 'sit-1' })
    expect(m.setConfirm).toHaveBeenCalledWith(null)
    expect(m.toastSuccess).toHaveBeenCalledWith('Sitting started.', {
      description: '3 codes will work until you close the sitting or the day ends (UTC).',
    })
  })

  it('toasts Start with no code count when the sitting has no codes', async () => {
    m.start.mockResolvedValue({ success: true, codesRestamped: 0, entriesWithoutCode: 0 })
    ui('start')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start sitting' }))
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalledWith('Sitting started.', undefined))
  })

  it('warns in the Start confirm when exams have no code yet', async () => {
    ui('start', { ...summary, entriesWithoutCode: 2 })
    expect(
      await screen.findByText('2 exams have no code yet. They cannot start until you issue codes.'),
    ).toBeInTheDocument()
  })

  it('uses the singular in the no-code line', async () => {
    ui('start', { ...summary, entriesWithoutCode: 1 })
    expect(
      await screen.findByText('1 exam has no code yet. They cannot start until you issue codes.'),
    ).toBeInTheDocument()
  })

  it('shows no no-code line when issuable entries exist but none lacks a code', async () => {
    ui('start', { ...summary, entriesWithoutCode: 0, entriesIssuable: 2 })
    await screen.findByRole('button', { name: 'Start sitting' })
    expect(screen.queryByText(/no code yet/)).not.toBeInTheDocument()
  })

  it('shows no no-code line when every exam has a code', async () => {
    ui('start')
    await screen.findByRole('button', { name: 'Start sitting' })
    expect(screen.queryByText(/no code yet/)).not.toBeInTheDocument()
  })

  it('reports a caution with the no-code line when the started sitting has exams without a code', async () => {
    m.start.mockResolvedValue({ success: true, codesRestamped: 3, entriesWithoutCode: 2 })
    ui('start')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start sitting' }))
    await waitFor(() => expect(m.setConfirm).toHaveBeenCalledWith(null))
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.toastError).toHaveBeenCalledWith('Sitting started.')
    expect(m.toastSuccess).not.toHaveBeenCalled()
  })

  it('closes the sitting and toasts voided, running and absent counts', async () => {
    m.close.mockResolvedValue({
      success: true,
      codesVoided: 1,
      attemptsRunning: 2,
      absentCount: 4,
    })
    ui('close')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Close sitting' }))
    await waitFor(() => expect(m.setConfirm).toHaveBeenCalledWith(null))
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.close).toHaveBeenCalledWith({ sittingId: 'sit-1' })
    expect(m.toastSuccess).toHaveBeenCalledWith('Sitting closed.', {
      description: '1 code voided, 2 running, 4 absent.',
    })
  })

  it('cancels the sitting and toasts the voided code count', async () => {
    m.cancel.mockResolvedValue({ success: true, codesVoided: 5 })
    ui('cancel')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancel sitting' }))
    await waitFor(() => expect(m.setConfirm).toHaveBeenCalledWith(null))
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.cancel).toHaveBeenCalledWith({ sittingId: 'sit-1' })
    expect(m.toastSuccess).toHaveBeenCalledWith('Sitting cancelled.', {
      description: '5 codes voided.',
    })
  })

  it('keeps the dialog open and shows the error when Start fails', async () => {
    m.start.mockResolvedValue({ success: false, error: 'This sitting has already been started.' })
    ui('start')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Start sitting' }))
    expect(await screen.findByText('This sitting has already been started.')).toBeInTheDocument()
    expect(m.refresh).not.toHaveBeenCalled()
    expect(m.setConfirm).not.toHaveBeenCalledWith(null)
  })

  it('renders no dialog when nothing is being confirmed', () => {
    ui(null)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('LifecycleConfirms Issue now (AC 45)', () => {
  it('shows Issue now only when entries are issuable', async () => {
    const { unmount } = ui('start', { ...summary, entriesWithoutCode: 2, entriesIssuable: 2 })
    expect(await screen.findByRole('button', { name: 'Issue now' })).toBeInTheDocument()
    unmount()
    ui('start', { ...summary, entriesWithoutCode: 2, entriesIssuable: 0 })
    await screen.findByRole('button', { name: 'Start sitting' })
    expect(screen.queryByRole('button', { name: 'Issue now' })).toBeNull()
  })

  it('calls onIssueNow and does not start the sitting', async () => {
    ui('start', { ...summary, entriesWithoutCode: 2, entriesIssuable: 2 })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Issue now' }))
    expect(m.issueNow).toHaveBeenCalledTimes(1)
    expect(m.start).not.toHaveBeenCalled()
  })
})
