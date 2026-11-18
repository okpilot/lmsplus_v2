import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}))
vi.mock('../actions/create-sitting', () => ({ createSitting: m.create }))
vi.mock('../actions/update-sitting', () => ({ updateSitting: m.update }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: m.replace, back: m.back, refresh: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams('tab=sittings&dlg=edit'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingFormDialog } from './sitting-form-dialog'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const invigilators = [{ id: INV, name: 'Ann Instructor' }]
const sitting = (status: string) => ({
  id: SID,
  status,
  scheduledAt: '2026-11-20T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: INV,
  permittedMaterials: 'Calculator',
})

const edit = (status: string) =>
  render(
    <SittingFormDialog
      mode="edit"
      sitting={sitting(status) as never}
      invigilators={invigilators as never}
    />,
  )

beforeEach(() => vi.resetAllMocks())

describe('SittingFormDialog', () => {
  it('disables Save in create mode until the form is valid', () => {
    render(<SittingFormDialog mode="new" invigilators={invigilators as never} />)
    expect(screen.getByLabelText('Date and time (UTC)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('prefills the UTC date input from the sitting in edit mode', () => {
    edit('scheduled')
    expect(screen.getByLabelText('Date and time (UTC)')).toHaveValue('2026-11-20T09:30')
  })

  it('submits UTC ISO values through updateSitting', async () => {
    m.update.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    edit('scheduled')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ sittingId: SID, scheduledAt: '2026-11-20T09:30:00.000Z' }),
    )
  })

  it('locks time and materials once the sitting is open', () => {
    edit('open')
    expect(screen.getByLabelText('Date and time (UTC)')).toBeDisabled()
    expect(screen.getByLabelText(/Permitted materials/)).toBeDisabled()
    expect(
      screen.getByText(
        'Locked once open: time, mode and materials. The invigilator can still be changed.',
      ),
    ).toBeInTheDocument()
  })

  it('sends only the invigilator for an open sitting', async () => {
    m.update.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    edit('open')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const arg = m.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.invigilatorId).toBe(INV)
    expect(arg.scheduledAt).toBeUndefined()
    expect(arg.mode).toBeUndefined()
    expect(arg.permittedMaterials).toBeUndefined()
  })

  it('shows the action error and stays open when saving fails', async () => {
    m.update.mockResolvedValue({
      success: false,
      error: 'The sitting date must be today or later (UTC).',
    })
    const user = userEvent.setup()
    edit('scheduled')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.getByText('The sitting date must be today or later (UTC).'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Date and time (UTC)')).toBeInTheDocument()
  })

  it('closes without saving on Escape', async () => {
    const user = userEvent.setup()
    edit('scheduled')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(m.back.mock.calls.length + m.replace.mock.calls.length).toBeGreaterThan(0),
    )
    expect(m.update).not.toHaveBeenCalled()
  })
})
