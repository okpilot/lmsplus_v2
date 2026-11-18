import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=issue'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'
import { PopupEnded, PopupMessage } from './popup-message'

beforeEach(() => vi.resetAllMocks())

describe('PopupMessage', () => {
  it('shows the title, the message and a Close button that closes the popup (AC 60)', async () => {
    render(
      <SittingUiProvider>
        <DialogShell>
          <PopupMessage title="Issue codes" message="This sitting has ended." />
        </DialogShell>
      </SittingUiProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Issue codes' })).toBeInTheDocument()
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Close' })[0] as never)
    expect(m.replace).toHaveBeenCalledWith('/x', { scroll: false })
  })

  it('PopupEnded says the sitting has ended under the given title', () => {
    render(
      <SittingUiProvider>
        <DialogShell>
          <PopupEnded title="Add people" />
        </DialogShell>
      </SittingUiProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Add people' })).toBeInTheDocument()
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
  })
})
