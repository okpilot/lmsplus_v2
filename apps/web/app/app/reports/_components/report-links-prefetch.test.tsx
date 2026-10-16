import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { SessionCard } from './session-card'
import { SessionTable } from './session-table'

const { mockLink } = vi.hoisted(() => ({ mockLink: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('next/link', () => ({
  default: (props: { href: string; children: React.ReactNode }) => {
    mockLink(props)
    return <a href={props.href}>{props.children}</a>
  },
}))

const SESSION: SessionReport = {
  id: 'sess-1',
  mode: 'quick_quiz',
  subjectName: 'Navigation',
  totalQuestions: 10,
  correctCount: 8,
  answeredItems: 9,
  scorePercentage: 80,
  startedAt: '2026-03-10T10:00:00Z',
  endedAt: '2026-03-10T10:15:00Z',
  durationMinutes: 15,
}

beforeEach(() => {
  mockLink.mockClear()
})

describe('report links', () => {
  it('does not prefetch the report page from a session card', () => {
    render(<SessionCard session={SESSION} />)

    expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({ prefetch: false }))
  })

  it('does not prefetch the report page from a session table row', () => {
    render(<SessionTable sessions={[SESSION]} sort="date" dir="desc" onSort={vi.fn()} />)

    expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({ prefetch: false }))
  })
})
