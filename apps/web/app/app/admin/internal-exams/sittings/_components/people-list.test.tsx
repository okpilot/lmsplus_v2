import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ add: vi.fn(), replace: vi.fn(), success: vi.fn() }))
vi.mock('../actions/add-candidates', () => ({ addCandidates: m.add }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people'),
}))
vi.mock('sonner', () => ({ toast: { success: m.success, error: vi.fn() } }))

import { SittingUiProvider, useSittingUi } from '../_hooks/sitting-ui-context'
import { DialogShell } from './dialog-shell'
import { PeopleList } from './people-list'

const row = (n: number, over: Record<string, unknown> = {}) => ({
  userId: `u${n}`,
  name: `Person ${n}`,
  email: `p${n}@example.com`,
  deactivated: false,
  groups: 'Group A',
  courses: 'PPL',
  ...over,
})
const group = { id: 'g1', name: 'Group A', activeNew: 2, deactivatedNew: 0 }

function Probe() {
  const { locked, people } = useSittingUi()
  return (
    <p data-testid="probe">
      {locked ? 'locked' : 'free'}:{people.ids.join(',')}
    </p>
  )
}

const tree = (rows: unknown[], g: typeof group | null = null) => (
  <SittingUiProvider>
    <Probe />
    <DialogShell>
      <PeopleList
        sittingId="s1"
        filters={<p>filters</p>}
        rows={rows as never}
        total={rows.length}
        page={1}
        group={g}
      />
    </DialogShell>
  </SittingUiProvider>
)
const list = (rows: unknown[], g: typeof group | null = null) => render(tree(rows, g))

beforeEach(() => vi.resetAllMocks())

describe('PeopleList', () => {
  it('lists the people with email, groups, courses and a muted Deactivated mark (AC 32)', () => {
    list([row(1), row(2, { deactivated: true })])
    expect(screen.getByText('p1@example.com')).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
    expect(screen.getAllByText('Group A · PPL')).toHaveLength(2)
    expect(screen.getByText('2 students')).toBeInTheDocument()
  })

  it('does not let a deactivated person be ticked (the add RPC refuses them)', () => {
    list([row(1), row(2, { deactivated: true })])
    expect(screen.getByRole('checkbox', { name: /Select .*2/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('checkbox', { name: /Select .*1$/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('shows an empty note without a header checkbox', () => {
    list([])
    expect(screen.getByText('No students to add.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Select all 0/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('ticks a person into the provider and counts it', async () => {
    list([row(1), row(2)])
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 2' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('u2')
    expect(screen.getByRole('status')).toHaveTextContent('1 selected')
  })

  it('header is indeterminate with some ticked and ticks the whole page when clicked', async () => {
    const user = userEvent.setup()
    list([row(1), row(2)])
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    expect(screen.getByRole('checkbox', { name: 'Select all 2 shown' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    )
    await user.click(screen.getByRole('checkbox', { name: 'Select all 2 shown' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('u1,u2')
  })

  it('keeps ticks when the filtered rows change (AC 31)', async () => {
    const view = list([row(1), row(2)])
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    view.rerender(tree([row(3)]))
    expect(screen.getByTestId('probe')).toHaveTextContent('u1')
    expect(screen.getByRole('status')).toHaveTextContent('1 selected')
  })

  it('adds the ticked people, clears the ticks and closes on success (AC 33)', async () => {
    m.add.mockResolvedValue({ success: true, added: 1, skippedExisting: 0, skippedDeactivated: 0 })
    const user = userEvent.setup()
    list([row(1)])
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Add selected (1)' }))
    expect(m.add).toHaveBeenCalledWith({ sittingId: 's1', userIds: ['u1'] })
    await waitFor(() => expect(m.replace).toHaveBeenCalled())
    expect(m.success).toHaveBeenCalledWith('Added 1 person.', undefined)
    expect(screen.getByTestId('probe')).toHaveTextContent('free:')
    expect(screen.getByTestId('probe').textContent).toBe('free:')
  })

  it('locks the popup for the call duration (AC 47)', async () => {
    let done: (v: unknown) => void = () => undefined
    m.add.mockReturnValue(new Promise((r) => (done = r)))
    const user = userEvent.setup()
    list([row(1)])
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Add selected (1)' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('locked')
    await act(async () =>
      done({ success: true, added: 1, skippedExisting: 0, skippedDeactivated: 0 }),
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('free')
  })

  it('keeps the popup open and the ticks on an error, showing it inside', async () => {
    m.add.mockResolvedValue({ success: false, error: 'A sitting can hold at most 500 people.' })
    const user = userEvent.setup()
    list([row(1)])
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(screen.getByRole('button', { name: 'Add selected (1)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('at most 500 people')
    expect(m.replace).not.toHaveBeenCalled()
    expect(screen.getByTestId('probe')).toHaveTextContent('u1')
  })

  it('adds a whole group together with the ticked people (AC 34)', async () => {
    m.add.mockResolvedValue({ success: true, added: 2, skippedExisting: 0, skippedDeactivated: 0 })
    const user = userEvent.setup()
    list([row(1)], group)
    await user.click(screen.getByRole('checkbox', { name: 'Select Person 1' }))
    await user.click(
      screen.getByRole('button', { name: 'Add whole group "Group A" (2 new) + 1 selected' }),
    )
    expect(m.add).toHaveBeenCalledWith({ sittingId: 's1', userIds: ['u1'], groupIds: ['g1'] })
  })

  it('adds a whole group with no userIds when nobody is ticked (AC 34)', async () => {
    m.add.mockResolvedValue({ success: true, added: 2, skippedExisting: 0, skippedDeactivated: 0 })
    list([row(1)], group)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Add whole group "Group A" (2 new)' }))
    expect(m.add).toHaveBeenCalledWith({ sittingId: 's1', userIds: [], groupIds: ['g1'] })
  })
})
