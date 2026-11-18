import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  listPeople: vi.fn(),
  listGroupOptions: vi.fn(),
  listCourseOptions: vi.fn(),
  getGroupAddCounts: vi.fn(),
}))
vi.mock('../people-queries', () => m)
vi.mock('../actions/add-candidates', () => ({ addCandidates: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams('dlg=people'),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingUiProvider } from '../_hooks/sitting-ui-context'
import { AddPeopleContent } from './add-people-content'
import { DialogShell } from './dialog-shell'

const person = {
  userId: 'u1',
  name: 'Ann Student',
  email: 'ann@example.com',
  deactivated: false,
  groups: 'G',
  courses: 'PPL',
}

async function body(filters: Record<string, unknown> = { page: 1 }) {
  const el = await AddPeopleContent({ sittingId: 's1', filters: filters as never })
  render(
    <SittingUiProvider>
      <DialogShell>{el}</DialogShell>
    </SittingUiProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  m.listPeople.mockResolvedValue({ rows: [person], total: 1 })
  m.listGroupOptions.mockResolvedValue([{ id: 'g1', name: 'Group A' }])
  m.listCourseOptions.mockResolvedValue([{ id: 'c1', name: 'PPL' }])
})

describe('AddPeopleContent', () => {
  it('renders the title, the filters and the addable people (AC 31)', async () => {
    await body()
    expect(screen.getByRole('heading', { name: 'Add people' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search name or email')).toBeInTheDocument()
    expect(screen.getByText('Ann Student')).toBeInTheDocument()
    expect(m.listPeople).toHaveBeenCalledWith({ sittingId: 's1', page: 1 })
    expect(m.getGroupAddCounts).not.toHaveBeenCalled()
  })

  it('passes every filter to the query', async () => {
    const f = { q: 'ann', group: 'g1', course: 'c1', status: 'inactive', page: 2 }
    m.getGroupAddCounts.mockResolvedValue({ activeNew: 1, deactivatedNew: 0 })
    await body(f)
    expect(m.listPeople).toHaveBeenCalledWith({ sittingId: 's1', ...f })
  })

  it('offers Add whole group with the counts when a Group filter is set (AC 34)', async () => {
    m.getGroupAddCounts.mockResolvedValue({ activeNew: 4, deactivatedNew: 1 })
    await body({ group: 'g1', page: 1 })
    expect(m.getGroupAddCounts).toHaveBeenCalledWith('s1', 'g1')
    expect(
      screen.getByRole('button', {
        name: 'Add whole group "Group A" (4 new, 1 deactivated skipped)',
      }),
    ).toBeInTheDocument()
  })

  it('omits the group button when the group is unknown', async () => {
    m.getGroupAddCounts.mockResolvedValue(null)
    await body({ group: 'g1', page: 1 })
    expect(screen.queryByRole('button', { name: /Add whole group/ })).toBeNull()
  })

  it('shows "This sitting has ended." with Close only when the sitting ended (AC 60)', async () => {
    m.listPeople.mockResolvedValue({ ended: true })
    await body()
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add selected/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0)
  })

  it('treats a missing sitting like an ended one', async () => {
    m.listPeople.mockResolvedValue(null)
    await body()
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
  })
})
