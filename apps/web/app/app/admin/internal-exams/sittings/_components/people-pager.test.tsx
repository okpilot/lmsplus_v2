import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people&ppage=2'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { PeoplePager } from './people-pager'

const pager = (page: number, pages: number, disabled = false) =>
  render(
    <SittingUiProvider>
      <PeoplePager page={page} pages={pages} disabled={disabled} />
    </SittingUiProvider>,
  )

beforeEach(() => vi.resetAllMocks())

describe('PeoplePager', () => {
  it('renders nothing for a single page', () => {
    pager(1, 1)
    expect(screen.queryByText(/Page/)).toBeNull()
  })

  it('shows the position and replaces ppage on Next / Previous', async () => {
    const user = userEvent.setup()
    pager(2, 3)
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(m.replace.mock.calls[0]?.[0]).toContain('ppage=3')
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(m.replace.mock.calls[1]?.[0]).not.toContain('ppage')
  })

  it('disables the ends and everything while busy', () => {
    pager(1, 3)
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    pager(2, 3, true)
    expect(screen.getAllByRole('button', { name: 'Next page' })[1]).toBeDisabled()
  })
})
