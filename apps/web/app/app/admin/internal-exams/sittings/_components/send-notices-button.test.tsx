import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ send: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock('../actions/send-sitting-notices', () => ({ sendSittingNotices: m.send }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { SendNoticesButton } from './send-notices-button'

beforeEach(() => vi.resetAllMocks())

function renderButton() {
  render(
    <SittingUiProvider>
      <SendNoticesButton sittingId="sit-1" />
    </SittingUiProvider>,
  )
}

describe('SendNoticesButton', () => {
  it('sends notices for its sitting and reports the sent count', async () => {
    m.send.mockResolvedValue({ success: true, sent: 2, failed: [], skipped: 0, unrecorded: 0 })
    renderButton()
    await userEvent.click(screen.getByRole('button', { name: 'Send notices' }))
    expect(m.send).toHaveBeenCalledWith({ sittingId: 'sit-1' })
    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled())
    expect(m.toastSuccess.mock.calls[0]?.[0]).toBe('Sent 2')
  })

  it('disables the button while sending and re-enables it after a failed send without a success toast', async () => {
    let resolveSend: (v: unknown) => void = () => {}
    m.send.mockReturnValue(new Promise((res) => (resolveSend = res)))
    renderButton()
    const button = screen.getByRole('button', { name: 'Send notices' })
    await userEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    resolveSend({ success: false, error: 'Not authorized' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(m.send).toHaveBeenCalledTimes(1)
    expect(m.toastSuccess).not.toHaveBeenCalled()
  })
})
