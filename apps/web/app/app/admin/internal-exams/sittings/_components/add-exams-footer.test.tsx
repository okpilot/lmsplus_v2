import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=exams'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { AddExamsFooter } from './add-exams-footer'

const base = { exams: 0, people: 2, singleDeactivated: false, busy: false, pending: false }
const footer = (over: Record<string, unknown> = {}) => {
  const onSubmit = vi.fn()
  render(
    <SittingUiProvider>
      <AddExamsFooter {...base} {...(over as object)} onSubmit={onSubmit} />
    </SittingUiProvider>,
  )
  return onSubmit
}

beforeEach(() => vi.resetAllMocks())

describe('AddExamsFooter', () => {
  it('says nothing is selected and disables Add at zero exams', () => {
    footer()
    expect(screen.getByRole('status')).toHaveTextContent('No exams selected')
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeDisabled()
  })

  it('counts exams for people without "pairs" (AC 38)', () => {
    footer({ exams: 3 })
    expect(screen.getByRole('status')).toHaveTextContent('3 exams for 2 people')
    expect(screen.getByRole('status')).not.toHaveTextContent(/pair/i)
  })

  it('submits on click', async () => {
    const onSubmit = footer({ exams: 1 })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add exams' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('disables Add above 1000 exam slots and shows the limit text (AC 38)', () => {
    footer({ exams: 3, people: 400 })
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeDisabled()
    expect(
      screen.getByText('Too many: 400 people x 3 exams = 1200; the limit is 1000. Untick exams.'),
    ).toBeInTheDocument()
  })

  it('allows exactly 1000', () => {
    footer({ exams: 2, people: 500 })
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeEnabled()
  })

  it('disables Add for a deactivated single person (AC 36)', () => {
    footer({ exams: 1, singleDeactivated: true })
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeDisabled()
  })

  it('disables Add while busy (AC 48)', () => {
    footer({ exams: 1, busy: true })
    expect(screen.getByRole('button', { name: 'Add exams' })).toBeDisabled()
  })
})
