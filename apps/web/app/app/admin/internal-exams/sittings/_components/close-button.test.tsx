import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people&pq=a'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { CloseButton } from './close-button'

function Lock() {
  const { setLocked } = useSittingUi()
  return (
    <button type="button" onClick={() => setLocked(true)}>
      lock
    </button>
  )
}

beforeEach(() => vi.resetAllMocks())

describe('CloseButton', () => {
  it('closes the popup, dropping every popup param', async () => {
    render(
      <SittingUiProvider>
        <CloseButton label="Cancel" />
      </SittingUiProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
    expect(m.replace).toHaveBeenCalledWith('/x', { scroll: false })
  })

  it('is disabled while a mutation holds the popup locked (AC 47)', async () => {
    render(
      <SittingUiProvider>
        <Lock />
        <CloseButton />
      </SittingUiProvider>,
    )
    await userEvent.setup().click(screen.getByText('lock'))
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  })
})
