import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { SittingFormDialog } from './sitting-form-dialog'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const INV2 = '00000000-0000-4000-a000-0000000000b2'
const invigilators = [{ id: INV, name: 'Ann Instructor' }]
const sitting = (status: string) => ({
  id: SID,
  status,
  scheduledAt: '2026-11-20T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: INV,
  invigilatorName: 'Ann Instructor',
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
afterEach(() => vi.restoreAllMocks())

describe('SittingFormDialog', () => {
  it('disables Save in create mode until the form is valid', () => {
    render(<SittingFormDialog mode="new" invigilators={invigilators as never} />)
    expect(screen.getByLabelText('Date and time (UTC)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('calls createSitting once on a double Save and keeps Save and Cancel disabled after success', async () => {
    window.history.replaceState(null, '', '/app/admin/internal-exams?tab=sittings&dlg=new')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    m.create.mockResolvedValue({ success: true, sittingId: SID })
    const user = userEvent.setup()
    render(<SittingFormDialog mode="new" invigilators={invigilators as never} />)
    await user.click(screen.getByRole('combobox', { name: 'Invigilator' }))
    await user.click(await screen.findByRole('option', { name: 'Ann Instructor' }))
    const save = screen.getByRole('button', { name: 'Save' })
    await user.click(save)
    await user.click(save)
    await waitFor(() => expect(m.push).toHaveBeenCalledTimes(1))
    expect(m.push).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState.mock.calls[0]?.[2]).not.toContain('dlg=')
    expect(replaceState.mock.calls[0]?.[2]).toContain('tab=sittings')
    expect(m.replace).not.toHaveBeenCalled()
    expect(m.create).toHaveBeenCalledTimes(1)
    // "Saving..." until the transition settles; then Save stays disabled because the sitting exists.
    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('replaces the dialog entry with the sitting when the dialog was opened in this session', async () => {
    window.history.replaceState(null, '', '/app/admin/internal-exams?tab=sittings&dlg=new')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    m.create.mockResolvedValue({ success: true, sittingId: SID })
    const user = userEvent.setup()
    function Opener() {
      const { open } = useSittingUi()
      return (
        <button type="button" onClick={() => open('new')}>
          opener
        </button>
      )
    }
    render(
      <SittingUiProvider>
        <Opener />
        <SittingFormDialog mode="new" invigilators={invigilators as never} />
      </SittingUiProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'opener', hidden: true }))
    await user.click(screen.getByRole('combobox', { name: 'Invigilator' }))
    await user.click(await screen.findByRole('option', { name: 'Ann Instructor' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(m.replace).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`),
    )
    expect(m.push).toHaveBeenCalledTimes(1)
    expect(m.push.mock.calls[0]?.[0]).toContain('dlg=new')
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('prefills the UTC date input from the sitting in edit mode', () => {
    edit('scheduled')
    expect(screen.getByLabelText('Date and time (UTC)')).toHaveValue('2026-11-20T09:30')
  })

  it('submits a changed time as a UTC ISO value and nothing else', async () => {
    m.update.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    edit('scheduled')
    fireEvent.change(screen.getByLabelText('Date and time (UTC)'), {
      target: { value: '2026-11-21T10:00' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.update).toHaveBeenCalledWith({
      sittingId: SID,
      scheduledAt: '2026-11-21T10:00:00.000Z',
    })
  })

  it('sends only the invigilator when only the invigilator changed', async () => {
    m.update.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(
      <SittingFormDialog
        mode="edit"
        sitting={sitting('scheduled') as never}
        invigilators={[...invigilators, { id: INV2, name: 'Bob Admin' }] as never}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Invigilator' }))
    await user.click(await screen.findByRole('option', { name: 'Bob Admin' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.update).toHaveBeenCalledWith({ sittingId: SID, invigilatorId: INV2 })
  })

  it('closes without calling the action when nothing changed', async () => {
    const user = userEvent.setup()
    edit('scheduled')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.update).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(m.back.mock.calls.length + m.replace.mock.calls.length).toBeGreaterThan(0),
    )
  })

  it('offers the inactive assigned invigilator as an option', async () => {
    const user = userEvent.setup()
    render(
      <SittingFormDialog
        mode="edit"
        sitting={
          { ...sitting('scheduled'), invigilatorId: INV2, invigilatorName: 'Old Ann' } as never
        }
        invigilators={invigilators as never}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Invigilator' }))
    expect(await screen.findByRole('option', { name: 'Old Ann (inactive)' })).toBeInTheDocument()
  })

  it('locks time and mode once the sitting is open', () => {
    edit('open')
    expect(screen.getByLabelText('Date and time (UTC)')).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeDisabled()
    expect(
      screen.getByText('Locked once open: time and mode. The invigilator can still be changed.'),
    ).toBeInTheDocument()
  })

  it('sends only the invigilator for an open sitting', async () => {
    m.update.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(
      <SittingFormDialog
        mode="edit"
        sitting={sitting('open') as never}
        invigilators={[...invigilators, { id: INV2, name: 'Bob Admin' }] as never}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Invigilator' }))
    await user.click(await screen.findByRole('option', { name: 'Bob Admin' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(m.update).toHaveBeenCalledWith({ sittingId: SID, invigilatorId: INV2 })
  })

  it('shows the action error and stays open when saving fails', async () => {
    m.update.mockResolvedValue({
      success: false,
      error: 'The sitting date must be today or later (UTC).',
    })
    const user = userEvent.setup()
    edit('scheduled')
    fireEvent.change(screen.getByLabelText('Date and time (UTC)'), {
      target: { value: '2026-11-21T10:00' },
    })
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
