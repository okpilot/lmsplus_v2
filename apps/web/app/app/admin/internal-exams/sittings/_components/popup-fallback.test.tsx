import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'
import { PopupFallback } from './popup-fallback'

describe('PopupFallback', () => {
  it('shows only the title and a loading note, no buttons beyond the dialog close', () => {
    render(
      <SittingUiProvider>
        <DialogShell>
          <PopupFallback title="Add people" />
        </DialogShell>
      </SittingUiProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Add people' })).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
