import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/reports',
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <select>{children}</select>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

const mk = (id: string): SessionReport => ({
  id,
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
})

function renderIt() {
  return render(
    <ReportsList
      sessions={[mk('a'), mk('b')]}
      page={1}
      totalCount={2}
      pageSize={10}
      sort="date"
      dir="desc"
    />,
  )
}

describe('ReportsList surfaces', () => {
  it('desktop table wrapper has no border class', () => {
    const { container } = renderIt()
    const wrap = container.querySelector('[data-slot="table-container"]')
      ?.parentElement as HTMLElement
    expect(wrap.className.split(/\s+/)).not.toContain('border')
    expect(wrap.className).toContain('hidden')
    expect(wrap.className).toContain('md:block')
  })

  it('mobile SessionCards sit inside one card-list', () => {
    const { container } = renderIt()
    const lists = container.querySelectorAll('[data-slot="card-list"]')
    expect(lists).toHaveLength(1)
    expect(lists[0]?.querySelectorAll('a[href*="session=a"], a[href*="session=b"]')).toHaveLength(2)
  })

  it('SessionCard link has no rounded or border classes', () => {
    const { container } = renderIt()
    const link = container.querySelector('[data-slot="card-list"] a') as HTMLElement
    expect(link.className).not.toMatch(/(^|\s)rounded-/)
    expect(link.className.split(/\s+/)).not.toContain('border')
  })
})
