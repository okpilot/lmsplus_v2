import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('../_hooks/sitting-ui-context', () => ({
  useSittingUi: () => ({
    open: m.open,
    isRefreshing: false,
    dlg: null,
    close: vi.fn(),
    openerRef: { current: null },
    locked: false,
    setLocked: vi.fn(),
    banner: null,
    setBanner: vi.fn(),
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingLifecycleButtons } from './sitting-lifecycle-buttons'

beforeEach(() => vi.resetAllMocks())

describe('SittingLifecycleButtons Edit opener', () => {
  it('opens Edit with the More actions trigger as the opener', async () => {
    const user = userEvent.setup()
    render(
      <SittingLifecycleButtons
        sitting={{ id: 'sit-1', status: 'scheduled', invigilatorName: 'A' } as never}
        summary={{} as never}
        notDue={false}
        dayEnded={false}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'More actions' })
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Edit details' }))
    expect(m.open).toHaveBeenCalledWith('edit', trigger)
  })
})
