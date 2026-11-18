import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams('tab=sittings'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { AddPeopleButton } from './add-people-button'

let ticks: string[] = []
let tick: (id: string) => void = () => undefined
function Probe() {
  const { people } = useSittingUi()
  ticks = people.ids
  tick = people.toggle
  return null
}

beforeEach(() => {
  vi.resetAllMocks()
  ticks = []
})

describe('AddPeopleButton (AC 31)', () => {
  it('clears previous popup ticks and opens dlg=people, keeping the other params', async () => {
    render(
      <SittingUiProvider>
        <AddPeopleButton />
        <Probe />
      </SittingUiProvider>,
    )
    act(() => tick('p1'))
    expect(ticks).toEqual(['p1'])
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add people' }))
    expect(ticks).toEqual([])
    const href = String(m.push.mock.calls[0]?.[0])
    expect(href).toContain('dlg=people')
    expect(href).toContain('tab=sittings')
  })
})
