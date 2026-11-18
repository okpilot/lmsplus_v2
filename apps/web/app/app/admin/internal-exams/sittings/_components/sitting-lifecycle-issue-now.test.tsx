import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn(), search: '' }))
vi.mock('../actions/start-sitting', () => ({ startSitting: vi.fn() }))
vi.mock('../actions/close-sitting', () => ({ closeSitting: vi.fn() }))
vi.mock('../actions/cancel-sitting', () => ({ cancelSitting: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(m.search),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { SittingLifecycleButtons } from './sitting-lifecycle-buttons'

const sitting = {
  id: 'sit-1',
  status: 'scheduled',
  scheduledAt: '2026-11-18T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: 'inv-1',
  invigilatorName: 'Ann',
  invigilatorActive: true,
}
const summary = {
  attemptsRunning: 0,
  entriesNotStarted: 0,
  studentsNotStarted: 0,
  entriesWithoutCode: 2,
  entriesIssuable: 2,
}

let opener: HTMLElement | null = null
function Probe() {
  opener = useSittingUi().openerRef.current
  return null
}

function ui() {
  const tree = () => (
    <SittingUiProvider>
      <SittingLifecycleButtons
        sitting={sitting as never}
        summary={summary as never}
        notDue={false}
        dayEnded={false}
      />
      <Probe />
    </SittingUiProvider>
  )
  const view = render(tree())
  return { rerender: () => view.rerender(tree()) }
}

beforeEach(() => {
  vi.resetAllMocks()
  m.search = ''
  opener = null
})

describe('Start confirm Issue now (AC 45)', () => {
  it('pushes dlg=issue with no extra params, records the Start button as opener', async () => {
    const user = userEvent.setup()
    ui()
    const start = screen.getByRole('button', { name: 'Start sitting' })
    await user.click(start)
    await user.click(await screen.findByRole('button', { name: 'Issue now' }))
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=issue')
    expect(href).not.toMatch(/ids=|all=/)
    await waitFor(() => expect(opener).toBe(start))
  })

  it('hides the Start confirm while the Issue popup is open and shows it again after', async () => {
    const user = userEvent.setup()
    const { rerender } = ui()
    await user.click(screen.getByRole('button', { name: 'Start sitting' }))
    await screen.findByRole('alertdialog')
    m.search = 'dlg=issue'
    rerender()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    m.search = ''
    rerender()
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })
})
