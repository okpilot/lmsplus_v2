import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import type { InternalExamHistoryEntry } from '../queries'
import { MyReportsTab } from './my-reports-tab'

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

const row: InternalExamHistoryEntry = {
  id: 'sess-1',
  subjectId: 'subj-1',
  subjectName: 'Air Law',
  subjectShort: '010',
  startedAt: '2026-03-15T23:30:00Z',
  endedAt: '2026-03-16T00:00:00Z',
  scorePercentage: 87.5,
  passed: true,
  totalQuestions: 16,
  answeredCount: 15,
  attemptNumber: 2,
}

describe('MyReportsTab dates', () => {
  it('renders the start time in UTC (day 15) under Pacific/Kiritimati', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    const { container } = render(<MyReportsTab rows={[row]} />)
    expect(container.textContent).toContain('15/03/2026, 23:30 UTC')
  })
})
