import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const q = vi.hoisted(() => ({ getGroupOptions: vi.fn(), getCourses: vi.fn() }))
const m = vi.hoisted(() => ({
  listPeople: vi.fn(),
  getGroupAddCounts: vi.fn(),
}))
vi.mock('../people-queries', () => m)
vi.mock('@/app/app/admin/students/queries', () => ({
  getGroupOptions: q.getGroupOptions,
  getCourses: q.getCourses,
}))
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
  m.listPeople.mockResolvedValue({ rows: [person], total: 1, page: 1 })
  q.getGroupOptions.mockResolvedValue([{ id: 'g1', name: 'Group A' }])
  q.getCourses.mockResolvedValue([{ id: 'c1', name: 'PPL' }])
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

  it('shows the page the query snapped to, not the one requested', async () => {
    m.listPeople.mockResolvedValue({ rows: [person], total: 120, page: 3 })
    await body({ page: 9 })
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
  })

  it('reads the group counts in parallel with the people', async () => {
    let release: (v: unknown) => void = () => undefined
    m.listPeople.mockReturnValue(new Promise((r) => (release = r)))
    m.getGroupAddCounts.mockResolvedValue({ activeNew: 1, deactivatedNew: 0 })
    const pending = AddPeopleContent({
      sittingId: 's1',
      filters: { group: 'g1', page: 1 } as never,
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(m.getGroupAddCounts).toHaveBeenCalledWith('s1', 'g1')
    release({ rows: [], total: 0, page: 1 })
    await pending
  })

  it('shows the ended notice when the group read says the sitting ended', async () => {
    m.getGroupAddCounts.mockResolvedValue({ ended: true })
    await body({ group: 'g1', page: 1 })
    expect(screen.getByText('This sitting has ended.')).toBeInTheDocument()
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
