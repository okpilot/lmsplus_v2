import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { SessionTable } from './session-table'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    onClick?: React.MouseEventHandler
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}))

const session: SessionReport = {
  id: 'sess-9',
  mode: 'quick_quiz',
  subjectName: 'Navigation',
  subjectCode: null,
  totalQuestions: 10,
  correctCount: 8,
  answeredItems: 9,
  scorePercentage: 80,
  startedAt: '2026-03-10T10:00:00Z',
  endedAt: '2026-03-10T10:15:00Z',
  durationMinutes: 15,
}
const onSort = vi.fn()
const URL_ = '/app/quiz/report?session=sess-9'

beforeEach(() => vi.clearAllMocks())

function renderIt() {
  return render(<SessionTable sessions={[session]} sort="date" dir="desc" onSort={onSort} />)
}

describe('SessionTable on ui/Table', () => {
  it('uses Table, TableHeader and TableRow slots with 6 columns', () => {
    const { container } = renderIt()
    expect(
      container.querySelector('[data-slot="table-container"] table[data-slot="table"]'),
    ).not.toBeNull()
    const thead = container.querySelector('thead[data-slot="table-header"]')
    expect(thead).not.toBeNull()
    expect(thead?.querySelectorAll('th')).toHaveLength(6)
    expect(container.querySelectorAll('tbody tr[data-slot="table-row"]')).toHaveLength(1)
  })

  it('sort click calls onSort', async () => {
    renderIt()
    await userEvent.click(screen.getByRole('button', { name: /subject/i }))
    expect(onSort).toHaveBeenCalledWith('subject')
  })

  it('row click navigates to the session URL', async () => {
    const { container } = renderIt()
    await userEvent.click(container.querySelector('tbody tr') as HTMLElement)
    expect(mockPush).toHaveBeenCalledWith(URL_)
  })

  it('Enter and Space on the row navigate to the session URL', async () => {
    const { container } = renderIt()
    const row = container.querySelector('tbody tr') as HTMLElement
    row.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(mockPush).toHaveBeenCalledTimes(2)
    expect(mockPush).toHaveBeenCalledWith(URL_)
  })
})
