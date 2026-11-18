import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSummary: vi.fn(),
  getRosterAll: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({ notFound: m.notFound }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../../queries', () => ({ getSummary: m.getSummary }))
vi.mock('../../roster-queries', () => ({ getRosterAll: m.getRosterAll }))

import PrintPage from './page'

const SID = '00000000-0000-4000-a000-0000000000a1'
const props = (id = SID) => ({ params: Promise.resolve({ sittingId: id }) })

const entry = (over: Record<string, unknown>) => ({
  entryId: 'e',
  subjectShort: 'FPM',
  subjectName: 'Flight Performance',
  status: 'ready',
  code: 'LIVE1234',
  codeExpiresAt: '2026-11-18T23:59:00Z',
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
  m.requireAdmin.mockResolvedValue({ supabase: {}, organizationId: 'o', userId: 'a' })
  m.getSummary.mockResolvedValue({
    status: 'scheduled',
    scheduledAt: '2026-11-18T09:30:00Z',
    dayEnded: false,
  })
  m.getRosterAll.mockResolvedValue([
    {
      userId: 'u1',
      name: 'Ann Student',
      email: 'ann@example.com',
      deactivated: false,
      entries: [
        entry({ entryId: 'e1', code: 'LIVE1234' }),
        entry({ entryId: 'e2', subjectShort: 'AGK', status: 'expired', code: null }),
        entry({ entryId: 'e3', subjectShort: 'HPL', status: 'voided', code: null }),
        entry({ entryId: 'e4', subjectShort: 'NAV', status: 'finished', code: 'USED9999' }),
      ],
    },
    {
      userId: 'u2',
      name: 'Bob',
      email: 'b@example.com',
      deactivated: false,
      entries: [entry({ entryId: 'e5', status: 'expired', code: null })],
    },
  ])
})

describe('PrintPage', () => {
  it('guards with requireAdmin before reading', async () => {
    await PrintPage(props() as never)
    const a = m.requireAdmin.mock.invocationCallOrder[0] as number
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    expect(a).toBeLessThan(s)
  })

  it('renders the live codes of a person on a card and excludes non-live codes', async () => {
    render(await PrintPage(props() as never))
    expect(screen.getByText('Ann Student')).toBeInTheDocument()
    expect(screen.getByText('LIVE1234')).toBeInTheDocument()
    expect(screen.queryByText('USED9999')).toBeNull()
    expect(screen.queryByText('AGK')).toBeNull()
    expect(screen.queryByText('HPL')).toBeNull()
    expect(screen.queryByText('Bob')).toBeNull()
  })

  it('has a heading, a Back to sitting link and a Valid until (UTC) column', async () => {
    render(await PrintPage(props() as never))
    expect(screen.getByRole('heading', { name: /^Exam codes/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sitting' })).toHaveAttribute(
      'href',
      `/app/admin/internal-exams/sittings/${SID}`,
    )
    expect(screen.getByText(/Valid until \(UTC\)/)).toBeInTheDocument()
  })

  it('says No live codes to print. when nothing is live', async () => {
    m.getRosterAll.mockResolvedValue([])
    render(await PrintPage(props() as never))
    expect(screen.getByText('No live codes to print.')).toBeInTheDocument()
  })

  it('returns 404 for a non-uuid id without reading', async () => {
    await expect(PrintPage(props('nope') as never)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSummary).not.toHaveBeenCalled()
  })

  it('returns 404 when the sitting is not found (foreign org)', async () => {
    m.getSummary.mockResolvedValue(null)
    await expect(PrintPage(props() as never)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getRosterAll).not.toHaveBeenCalled()
  })

  it.each(['closed', 'cancelled'])('returns 404 for a %s sitting', async (status) => {
    m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-18T09:30:00Z', dayEnded: false })
    await expect(PrintPage(props() as never)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getRosterAll).not.toHaveBeenCalled()
  })

  it('returns 404 when the sitting day has ended', async () => {
    m.getSummary.mockResolvedValue({
      status: 'open',
      scheduledAt: '2026-11-17T09:30:00Z',
      dayEnded: true,
    })
    await expect(PrintPage(props() as never)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
