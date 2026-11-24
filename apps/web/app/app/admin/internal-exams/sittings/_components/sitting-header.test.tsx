import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams/sittings/sit-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('../actions/start-sitting', () => ({ startSitting: vi.fn() }))
vi.mock('../actions/close-sitting', () => ({ closeSitting: vi.fn() }))
vi.mock('../actions/cancel-sitting', () => ({ cancelSitting: vi.fn() }))
vi.mock('../actions/update-sitting', () => ({ updateSitting: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SittingHeader } from './sitting-header'

const base = {
  id: 'sit-1',
  status: 'scheduled',
  scheduledAt: '2026-11-18T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: 'inv-1',
  invigilatorName: 'Ann Instructor',
  invigilatorActive: true,
  permittedMaterials: 'Calculator',
  endedAutomatically: false,
}
const summary = { attemptsRunning: 0, entriesNotStarted: 0, studentsNotStarted: 0 }

function ui(over: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) {
  return render(
    <SittingHeader
      sitting={{ ...base, ...over } as never}
      summary={summary as never}
      invigilators={[]}
      notDue={false}
      dayEnded={false}
      {...(flags as object)}
    />,
  )
}

describe('SittingHeader', () => {
  it('shows the UTC title and the description line', () => {
    ui()
    expect(
      screen.getByRole('heading', { level: 1, name: '18 Nov 2026, 09:30 UTC' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Scheduled · Remote · Invigilator Ann Instructor · Materials: Calculator'),
    ).toBeInTheDocument()
  })

  it('omits Materials when none are set and marks an inactive invigilator', () => {
    ui({ permittedMaterials: null, invigilatorActive: false })
    expect(
      screen.getByText('Scheduled · Remote · Invigilator Ann Instructor (inactive)'),
    ).toBeInTheDocument()
  })

  it.each([
    ['scheduled', false, 'upcoming'],
    ['open', false, 'open'],
    ['closed', false, 'past'],
    ['cancelled', false, 'cancelled'],
    ['scheduled', true, 'cancelled'],
    ['open', true, 'past'],
  ])(
    'links the breadcrumb to the list a %s sitting (day ended: %s) is in: %s',
    (status, dayEnded, scope) => {
      ui({ status }, { dayEnded })
      expect(screen.getByRole('link', { name: 'Internal Exams' })).toHaveAttribute(
        'href',
        `/app/admin/internal-exams?tab=sittings&scope=${scope}`,
      )
    },
  )

  it('shows Can start on {date} (UTC). when the sitting is not yet due', () => {
    ui({}, { notDue: true })
    expect(screen.getByText('Can start on 18 Nov 2026 (UTC).')).toBeInTheDocument()
  })

  it('shows the closed notice, plain and automatic variants', () => {
    const { unmount } = ui({ status: 'closed' })
    expect(screen.getByText('Closed.')).toBeInTheDocument()
    unmount()
    ui({ status: 'closed', endedAutomatically: true })
    expect(screen.getByText('Closed automatically at the end of its day.')).toBeInTheDocument()
  })

  it('shows the cancelled notice, plain and automatic variants', () => {
    const { unmount } = ui({ status: 'cancelled' })
    expect(screen.getByText('Cancelled.')).toBeInTheDocument()
    unmount()
    ui({ status: 'cancelled', endedAutomatically: true })
    expect(screen.getByText('Cancelled automatically: never started.')).toBeInTheDocument()
  })

  it("shows a caution note and no actions when the sitting's day has ended", () => {
    ui({ status: 'open' }, { dayEnded: true })
    expect(screen.getByText("This sitting's day has ended.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close sitting' })).not.toBeInTheDocument()
  })

  it.each(['closed', 'cancelled'])('renders no action buttons for a %s sitting', (status) => {
    ui({ status })
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sitting$/ })).not.toBeInTheDocument()
  })
})
