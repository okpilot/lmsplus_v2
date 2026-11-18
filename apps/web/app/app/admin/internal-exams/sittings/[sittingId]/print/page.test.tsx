import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  loadPrintPage: vi.fn(),
}))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../../_utils/load-print-page', () => ({ loadPrintPage: m.loadPrintPage }))

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

const loaded = (people: unknown[]) => ({
  sittingId: SID,
  scheduledAt: '2026-11-18T09:30:00Z',
  people,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.requireAdmin.mockResolvedValue({ supabase: {}, organizationId: 'o', userId: 'a' })
  m.loadPrintPage.mockResolvedValue(
    loaded([
      {
        userId: 'u1',
        name: 'Ann Student',
        email: 'ann@example.com',
        deactivated: false,
        entries: [entry({ entryId: 'e1' })],
      },
    ]),
  )
})

describe('PrintPage', () => {
  it('guards with requireAdmin before loading', async () => {
    await PrintPage(props() as never)
    const a = m.requireAdmin.mock.invocationCallOrder[0] as number
    const l = m.loadPrintPage.mock.invocationCallOrder[0] as number
    expect(a).toBeLessThan(l)
    expect(m.loadPrintPage).toHaveBeenCalledWith(SID)
  })

  it('renders the loaded people on cards', async () => {
    render(await PrintPage(props() as never))
    expect(screen.getByText('Ann Student')).toBeInTheDocument()
    expect(screen.getByText('LIVE1234')).toBeInTheDocument()
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
    m.loadPrintPage.mockResolvedValue(loaded([]))
    render(await PrintPage(props() as never))
    expect(screen.getByText('No live codes to print.')).toBeInTheDocument()
  })

  it('propagates the loader 404', async () => {
    m.loadPrintPage.mockRejectedValue(new Error('NEXT_NOT_FOUND'))
    await expect(PrintPage(props('nope') as never)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
