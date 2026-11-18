import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ search: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/s1',
  useSearchParams: () => new URLSearchParams(m.search),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { PopupGate } from './popup-gate'

const gate = () =>
  render(
    <SittingUiProvider>
      <PopupGate name="people">
        <p>body</p>
      </PopupGate>
    </SittingUiProvider>,
  )

beforeEach(() => {
  m.search = ''
})

describe('PopupGate', () => {
  it('mounts the dialog with its body while the client dlg names it', () => {
    m.search = 'dlg=people'
    gate()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('renders nothing when the client dlg is gone (Back to a cached server render)', () => {
    gate()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders nothing for another popup', () => {
    m.search = 'dlg=issue'
    gate()
    expect(screen.queryByText('body')).toBeNull()
  })
})
