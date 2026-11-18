import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSummary: vi.fn(),
  getSitting: vi.fn(),
  listInvigilatorOptions: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({ notFound: m.notFound }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../queries', () => ({
  getSummary: m.getSummary,
  getSitting: m.getSitting,
  listInvigilatorOptions: m.listInvigilatorOptions,
}))

import SittingPage from './page'

const SID = '00000000-0000-4000-a000-0000000000a1'
const params = (id: string) => ({
  params: Promise.resolve({ sittingId: id }),
  searchParams: Promise.resolve({}),
})

beforeEach(() => {
  vi.clearAllMocks()
  m.requireAdmin.mockResolvedValue({ supabase: {}, organizationId: 'o', userId: 'a' })
  m.getSummary.mockResolvedValue({ status: 'scheduled', scheduledAt: '2026-11-20T09:30:00Z' })
  m.getSitting.mockResolvedValue({
    id: SID,
    status: 'scheduled',
    scheduledAt: '2026-11-20T09:30:00Z',
  })
  m.listInvigilatorOptions.mockResolvedValue([])
})

describe('SittingPage', () => {
  it('returns 404 for a non-uuid id without querying', async () => {
    await expect(SittingPage(params('not-a-uuid') as never)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSummary).not.toHaveBeenCalled()
  })

  it('returns 404 when there is no summary', async () => {
    m.getSummary.mockResolvedValue(null)
    await expect(SittingPage(params(SID) as never)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('returns 404 when the sitting row is missing', async () => {
    m.getSitting.mockResolvedValue(null)
    await expect(SittingPage(params(SID) as never)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('guards with requireAdmin and reads the summary before the sitting', async () => {
    await SittingPage(params(SID) as never)
    expect(m.requireAdmin).toHaveBeenCalled()
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    const g = m.getSitting.mock.invocationCallOrder[0] as number
    expect(s).toBeLessThan(g)
  })
})
