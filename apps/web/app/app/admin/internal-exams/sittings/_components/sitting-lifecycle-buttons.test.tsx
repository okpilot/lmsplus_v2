import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  start: vi.fn(),
  close: vi.fn(),
  cancel: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../actions/start-sitting', () => ({ startSitting: m.start }))
vi.mock('../actions/close-sitting', () => ({ closeSitting: m.close }))
vi.mock('../actions/cancel-sitting', () => ({ cancelSitting: m.cancel }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: m.replace, refresh: m.refresh, back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingLifecycleButtons } from './sitting-lifecycle-buttons'

const sitting = (status: string) => ({
  id: 'sit-1',
  status,
  scheduledAt: '2026-11-18T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: 'inv-1',
  invigilatorName: 'Ann Instructor',
  invigilatorActive: true,
})
const summary = {
  attemptsRunning: 2,
  entriesNotStarted: 3,
  studentsNotStarted: 2,
  entriesWithoutCode: 0,
  entriesIssuable: 0,
}

function ui(status: string, extra: Record<string, unknown> = {}) {
  return render(
    <SittingLifecycleButtons
      sitting={sitting(status) as never}
      summary={summary as never}
      notDue={false}
      dayEnded={false}
      {...(extra as object)}
    />,
  )
}

beforeEach(() => vi.resetAllMocks())

describe('SittingLifecycleButtons', () => {
  it('shows Start sitting and the More actions menu for a scheduled sitting', () => {
    ui('scheduled')
    expect(screen.getByRole('button', { name: 'Start sitting' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('shows Close sitting for an open sitting', () => {
    ui('open')
    expect(screen.getByRole('button', { name: 'Close sitting' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start sitting' })).not.toBeInTheDocument()
  })

  it('disables Start sitting when the sitting is not yet due', () => {
    ui('scheduled', { notDue: true })
    expect(screen.getByRole('button', { name: 'Start sitting' })).toBeDisabled()
  })

  it.each(['closed', 'cancelled'])('renders no actions for a %s sitting', (status) => {
    const { container } = ui(status)
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders no actions when the day has ended', () => {
    const { container } = ui('scheduled', { dayEnded: true })
    expect(container.querySelector('button')).toBeNull()
  })

  it('offers Edit details and Cancel sitting in the menu, without Print codes', async () => {
    const user = userEvent.setup()
    ui('scheduled')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit details' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cancel sitting' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Print codes' })).not.toBeInTheDocument()
  })

  it('opens the Start confirm with the spec copy', async () => {
    const user = userEvent.setup()
    ui('scheduled')
    await user.click(screen.getByRole('button', { name: 'Start sitting' }))
    expect(await screen.findByText('Start sitting?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Candidates can start with their codes until you close the sitting or the day ends (UTC).',
      ),
    ).toBeInTheDocument()
  })

  it('warns in the Start confirm when exams have no code yet', async () => {
    const user = userEvent.setup()
    render(
      <SittingLifecycleButtons
        sitting={sitting('scheduled') as never}
        summary={{ ...summary, entriesWithoutCode: 2 } as never}
        notDue={false}
        dayEnded={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Start sitting' }))
    expect(
      await screen.findByText('2 exams have no code yet. They cannot start until you issue codes.'),
    ).toBeInTheDocument()
  })

  it('warns in the Start confirm when the invigilator is inactive', async () => {
    const user = userEvent.setup()
    render(
      <SittingLifecycleButtons
        sitting={{ ...sitting('scheduled'), invigilatorActive: false } as never}
        summary={summary as never}
        notDue={false}
        dayEnded={false}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Start sitting' }))
    expect(
      await screen.findByText(
        'The assigned invigilator Ann Instructor is no longer an active admin or instructor.',
      ),
    ).toBeInTheDocument()
  })

  it('opens the Close confirm with counts and a Keep open button', async () => {
    const user = userEvent.setup()
    ui('open')
    await user.click(screen.getByRole('button', { name: 'Close sitting' }))
    expect(await screen.findByText('Close sitting?')).toBeInTheDocument()
    expect(screen.getByText(/2 attempts running will continue to the end\./)).toBeInTheDocument()
    expect(screen.getByText(/3 exams \(2 students\) have not started/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep open' })).toBeInTheDocument()
  })

  it('opens the Cancel confirm with Keep sitting and no lab strings', async () => {
    const user = userEvent.setup()
    ui('scheduled')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Cancel sitting' }))
    expect(await screen.findByText('Cancel sitting?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep sitting' })).toBeInTheDocument()
    expect(
      screen.getByText(/Unused codes are voided\. A cancelled sitting cannot be restored\./),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('stored in the lab')
  })

  it('shows the mapped sitting_has_attempts message when Cancel fails', async () => {
    const user = userEvent.setup()
    m.cancel.mockResolvedValue({
      success: false,
      error: 'A candidate has already taken an exam in this sitting.',
    })
    ui('scheduled')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Cancel sitting' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel sitting' }))
    await waitFor(() =>
      expect(
        screen.getByText('A candidate has already taken an exam in this sitting.'),
      ).toBeInTheDocument(),
    )
  })
})
