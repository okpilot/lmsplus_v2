import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams('tab=sittings'),
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    onKeyDown,
    prefetch,
  }: {
    href: string
    children: React.ReactNode
    onClick?: (e: React.MouseEvent) => void
    onKeyDown?: (e: React.KeyboardEvent) => void
    prefetch?: boolean
  }) => (
    <a href={href} onClick={onClick} onKeyDown={onKeyDown} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}))

import { SittingsTable } from './sittings-table'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'sit-1',
  scheduledAt: '2026-11-18T09:30:00.000Z',
  mode: 'remote',
  status: 'scheduled',
  invigilatorId: 'inv-1',
  invigilatorName: 'Ann Instructor',
  invigilatorActive: true,
  permittedMaterials: null,
  startedAt: null,
  closedAt: null,
  candidates: 5,
  entries: 13,
  entriesWithoutCode: 0,
  entriesFinished: 0,
  entriesAbsent: 0,
  endedAutomatically: false,
  ...over,
})

beforeEach(() => mockPush.mockReset())

describe('SittingsTable', () => {
  it('shows the six column headers', () => {
    render(<SittingsTable rows={[row()] as never} />)
    for (const h of ['Date (UTC)', 'Status', 'Mode', 'Invigilator', 'People', 'Exams'])
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
  })

  it('opens the sitting page when the row is clicked', () => {
    render(<SittingsTable rows={[row()] as never} />)
    fireEvent.click(screen.getAllByRole('row')[1] as HTMLElement)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/internal-exams/sittings/sit-1')
  })

  it('opens the sitting page on Enter from the row', () => {
    render(<SittingsTable rows={[row()] as never} />)
    fireEvent.keyDown(screen.getAllByRole('row')[1] as HTMLElement, { key: 'Enter' })
    expect(mockPush).toHaveBeenCalledWith('/app/admin/internal-exams/sittings/sit-1')
  })

  it('does not push the row route when Enter is pressed on the date link', () => {
    render(<SittingsTable rows={[row()] as never} />)
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('holds the only link in the date cell, unprefetched', () => {
    render(<SittingsTable rows={[row()] as never} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/app/admin/internal-exams/sittings/sit-1')
    expect(links[0]).toHaveAttribute('data-prefetch', 'false')
    expect(links[0]).toHaveTextContent('18 Nov 2026, 09:30')
  })

  it('does not trigger the row navigation when the date link is clicked', () => {
    render(<SittingsTable rows={[row()] as never} />)
    fireEvent.click(screen.getByRole('link'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('marks an inactive invigilator', () => {
    render(<SittingsTable rows={[row({ invigilatorActive: false })] as never} />)
    expect(screen.getByText('(inactive)')).toBeInTheDocument()
  })

  it('reads Scheduled for a scheduled sitting and Remote for its mode', () => {
    render(<SittingsTable rows={[row()] as never} />)
    const cells = within(screen.getAllByRole('row')[1] as HTMLElement)
    expect(cells.getByText('Scheduled')).toBeInTheDocument()
    expect(cells.getByText('Remote')).toBeInTheDocument()
  })

  it('shows the exam count with a needs-a-code suffix for a scheduled sitting', () => {
    render(<SittingsTable rows={[row({ entriesWithoutCode: 3 })] as never} />)
    expect(screen.getByText('13 exams · 3 need a code')).toBeInTheDocument()
  })

  it('shows finished and absent counts for a closed sitting', () => {
    render(
      <SittingsTable
        rows={
          [row({ status: 'closed', entries: 4, entriesFinished: 3, entriesAbsent: 1 })] as never
        }
      />,
    )
    expect(screen.getByText('4 exams · 3 finished · 1 absent')).toBeInTheDocument()
  })

  it('shows only the count for a cancelled sitting', () => {
    render(
      <SittingsTable
        rows={[row({ status: 'cancelled', entries: 2, entriesWithoutCode: 1 })] as never}
      />,
    )
    expect(screen.getByText('2 exams')).toBeInTheDocument()
  })

  it('does not force the Exams cell to wrap at narrow widths', () => {
    const { container } = render(<SittingsTable rows={[row()] as never} />)
    expect(container.innerHTML).not.toContain('whitespace-normal')
  })
})
