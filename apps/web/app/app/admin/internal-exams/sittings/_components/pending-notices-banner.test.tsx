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
import { PendingNoticesBanner } from './pending-notices-banner'
import { ResultBanner } from './result-banner'

const ui = (count: number) =>
  render(
    <SittingUiProvider>
      <PendingNoticesBanner count={count} sittingId="sit-1" />
      <ResultBanner />
    </SittingUiProvider>,
  )

const seen = () =>
  [m.toastSuccess, m.toastError]
    .flatMap((f) => f.mock.calls.flat())
    .map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))
    .concat(document.body.textContent ?? '')
    .join(' ')

beforeEach(() => vi.resetAllMocks())

describe('PendingNoticesBanner', () => {
  it('renders nothing when no notice is pending', () => {
    const { container } = ui(0)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the plural copy with the count and a Send notices button', () => {
    ui(3)
    expect(screen.getByText('3 notices waiting to be sent.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send notices' })).toBeInTheDocument()
  })

  it('uses the singular for one notice', () => {
    ui(1)
    expect(screen.getByText('1 notice waiting to be sent.')).toBeInTheDocument()
  })

  it('sends the notices of the sitting when Send notices is clicked', async () => {
    m.send.mockResolvedValue({ success: true, sent: 2, failed: [], skipped: 0, unrecorded: 0 })
    ui(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send notices' }))
    await waitFor(() => expect(m.send).toHaveBeenCalledWith({ sittingId: 'sit-1' }))
    await waitFor(() => expect(seen()).toContain('Sent 2'))
  })

  it('reports Sent and Failed counts with the failed names', async () => {
    m.send.mockResolvedValue({
      success: true,
      sent: 1,
      failed: [{ studentName: 'Ann Pilot' }],
      skipped: 0,
      unrecorded: 0,
    })
    ui(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send notices' }))
    await waitFor(() => expect(seen()).toContain('Sent 1'))
    expect(seen()).toContain('Failed 1')
    expect(seen()).toContain('Ann Pilot')
  })

  it('shows the error when the action fails', async () => {
    m.send.mockResolvedValue({ success: false, error: 'Sitting not found' })
    ui(2)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send notices' }))
    await waitFor(() => expect(seen()).toContain('Sitting not found'))
  })
})
