import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  update: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../actions/create-sitting', () => ({ createSitting: vi.fn() }))
vi.mock('../actions/update-sitting', () => ({ updateSitting: m.update }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams('tab=sittings&dlg=edit'),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingFormDialog } from './sitting-form-dialog'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const sitting = {
  id: SID,
  status: 'scheduled',
  scheduledAt: '2026-11-20T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: INV,
  invigilatorName: 'Ann Instructor',
}

async function save(result: unknown) {
  m.update.mockResolvedValue(result)
  render(
    <SittingFormDialog
      mode="edit"
      sitting={sitting as never}
      invigilators={[{ id: INV, name: 'Ann Instructor' }] as never}
    />,
  )
  fireEvent.change(screen.getByLabelText('Date and time (UTC)'), {
    target: { value: '2026-11-21T10:00' },
  })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(m.update).toHaveBeenCalled())
}

const seen = () =>
  [m.toastSuccess, m.toastError]
    .flatMap((f) => f.mock.calls.flat())
    .map((c) => JSON.stringify(c))
    .concat(document.body.textContent ?? '')
    .join(' ')

beforeEach(() => vi.resetAllMocks())

describe('SittingFormDialog change notices', () => {
  it('says how many students got a change notice', async () => {
    await save({ success: true, notices: { sent: 2, failed: [] } })
    await waitFor(() => expect(seen()).toContain('Change notice sent to 2 students'))
  })

  it('names the students whose change notice failed and points to Resend code', async () => {
    await save({ success: true, notices: { sent: 1, failed: [{ studentName: 'Ann Pilot' }] } })
    await waitFor(() => expect(seen()).toContain('Change notice failed for Ann Pilot.'))
    expect(seen()).toContain('Use Resend code on their exams')
  })

  it('shows no change-notice text when no notice was due', async () => {
    await save({ success: true, notices: { sent: 0, failed: [] } })
    await waitFor(() => expect(m.update).toHaveBeenCalled())
    expect(seen()).not.toContain('Change notice')
  })
})
