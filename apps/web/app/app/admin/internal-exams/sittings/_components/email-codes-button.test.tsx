import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  run: vi.fn(),
  email: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../actions/email-sitting-codes', () => ({ emailSittingCodes: m.email }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./use-sitting-action', async (orig) => {
  const actual = await orig<typeof import('./use-sitting-action')>()
  return {
    useSittingAction: () => {
      const r = actual.useSittingAction()
      return {
        ...r,
        run: (...args: Parameters<typeof r.run>) => {
          m.run(args[2])
          return r.run(...args)
        },
      }
    },
  }
})
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { EmailCodesButton } from './email-codes-button'
import { ResultBanner } from './result-banner'

function ui() {
  return render(
    <SittingUiProvider>
      <EmailCodesButton sittingId="sit-1" />
      <ResultBanner />
    </SittingUiProvider>,
  )
}

const seen = () =>
  [m.toastSuccess, m.toastError]
    .flatMap((f) => f.mock.calls.flat())
    .concat(document.body.textContent)
    .join(' ')

async function confirm() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Email codes' }))
  const dialog = await screen.findByRole('alertdialog')
  return { user, dialog }
}

beforeEach(() => vi.resetAllMocks())

describe('EmailCodesButton', () => {
  it('asks for confirmation with the spec copy before sending anything', async () => {
    ui()
    const { dialog } = await confirm()
    expect(
      within(dialog).getByText('Email every unused code not yet emailed to its student.'),
    ).toBeInTheDocument()
    expect(m.email).not.toHaveBeenCalled()
  })

  it('sends for the sitting on confirm', async () => {
    m.email.mockResolvedValue({ success: true, sent: 1, failed: [], skipped: 0 })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(m.email).toHaveBeenCalledWith({ sittingId: 'sit-1' }))
  })

  it('runs the send with the popup locked', async () => {
    m.email.mockResolvedValue({ success: true, sent: 0, failed: [], skipped: 0, unrecorded: 0 })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(m.run).toHaveBeenCalledWith({ lock: true }))
  })

  it('does not send when the confirm is cancelled', async () => {
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(m.email).not.toHaveBeenCalled()
  })

  it('reports Emailed, Failed with names, and Skipped counts', async () => {
    m.email.mockResolvedValue({
      success: true,
      sent: 3,
      failed: [{ studentName: 'Ann Student', subjectName: 'Meteorology' }],
      skipped: 2,
      unrecorded: 0,
    })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(seen()).toContain('Emailed 3'))
    expect(seen()).toContain('Failed 1')
    expect(seen()).toContain('Ann Student')
    expect(seen()).toContain('Skipped 2')
    expect(seen()).toContain('no email or deactivated')
  })

  it('reports Emailed 0 on a re-run', async () => {
    m.email.mockResolvedValue({ success: true, sent: 0, failed: [], skipped: 0, unrecorded: 0 })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(seen()).toContain('Emailed 0'))
  })

  it('reports sent-but-unrecorded codes', async () => {
    m.email.mockResolvedValue({ success: true, sent: 2, failed: [], skipped: 0, unrecorded: 1 })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(seen()).toContain('1 sent but not recorded'))
    expect(seen()).not.toContain('will send them again')
  })

  it('shows the action error', async () => {
    m.email.mockResolvedValue({ success: false, error: "This sitting's day has ended." })
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(seen()).toContain("This sitting's day has ended."))
  })

  it('disables the button while the send is pending', async () => {
    let finish: (v: unknown) => void = () => undefined
    m.email.mockReturnValue(
      new Promise((r) => {
        finish = r
      }),
    )
    ui()
    const { user, dialog } = await confirm()
    await user.click(within(dialog).getByRole('button', { name: 'Email codes' }))
    await waitFor(() => expect(m.email).toHaveBeenCalledTimes(1))
    const btns = screen.getAllByRole('button', { name: /Email codes|Sending/ })
    expect(
      btns.every(
        (b) => (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true',
      ),
    ).toBe(true)
    finish({ success: true, sent: 0, failed: [], skipped: 0 })
  })
})
