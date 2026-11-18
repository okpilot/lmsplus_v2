import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getSitting: vi.fn(),
  listInvigilatorOptions: vi.fn(),
  getRoster: vi.fn(),
  getRemoved: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({ notFound: m.notFound }))
vi.mock('../queries', () => ({
  getSummary: m.getSummary,
  getSitting: m.getSitting,
  listInvigilatorOptions: m.listInvigilatorOptions,
}))

vi.mock('../roster-queries', () => ({ getRoster: m.getRoster, getRemoved: m.getRemoved }))

import { loadSittingPage } from './load-sitting-page'

const SID = '00000000-0000-4000-a000-0000000000a1'

beforeEach(() => {
  vi.resetAllMocks()
  m.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
  m.getSummary.mockResolvedValue({ status: 'scheduled', scheduledAt: '2026-11-20T09:30:00Z' })
  m.getSitting.mockResolvedValue({
    id: SID,
    status: 'scheduled',
    scheduledAt: '2026-11-20T09:30:00Z',
  })
  m.listInvigilatorOptions.mockResolvedValue([{ id: 'i1', name: 'Ann' }])
  m.getRoster.mockResolvedValue({ rows: [], total: 0 })
  m.getRemoved.mockResolvedValue({ rows: [], total: 0 })
})

describe('loadSittingPage', () => {
  it('returns 404 for a non-uuid id without querying', async () => {
    await expect(loadSittingPage('not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSummary).not.toHaveBeenCalled()
  })

  it('returns 404 when there is no summary', async () => {
    m.getSummary.mockResolvedValue(null)
    await expect(loadSittingPage(SID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSitting).not.toHaveBeenCalled()
  })

  it('returns 404 when the sitting row is missing', async () => {
    m.getSitting.mockResolvedValue(null)
    await expect(loadSittingPage(SID)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('reads the summary before the sitting', async () => {
    await loadSittingPage(SID)
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    const g = m.getSitting.mock.invocationCallOrder[0] as number
    expect(s).toBeLessThan(g)
  })

  it('returns sitting, summary, invigilators and notDue for a future sitting', async () => {
    m.getSitting.mockResolvedValue({ id: SID, scheduledAt: '2999-01-01T09:00:00Z' })
    const r = await loadSittingPage(SID)
    expect(r.invigilators).toEqual([{ id: 'i1', name: 'Ann' }])
    expect(r.summary).toMatchObject({ status: 'scheduled' })
    expect(r.notDue).toBe(true)
  })

  it('is not notDue for a past sitting', async () => {
    m.getSitting.mockResolvedValue({ id: SID, scheduledAt: '2020-01-01T09:00:00Z' })
    expect((await loadSittingPage(SID)).notDue).toBe(false)
  })

  it.each(['scheduled', 'open'])('loads invigilator options for a %s sitting', async (status) => {
    m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
    await loadSittingPage(SID)
    expect(m.listInvigilatorOptions).toHaveBeenCalledTimes(1)
  })

  it('skips invigilator options when the day has ended', async () => {
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      dayEnded: true,
    })
    const r = await loadSittingPage(SID)
    expect(m.listInvigilatorOptions).not.toHaveBeenCalled()
    expect(r.invigilators).toEqual([])
  })

  it.each(['closed', 'cancelled'])('skips invigilator options for a %s sitting', async (status) => {
    m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
    const r = await loadSittingPage(SID)
    expect(m.listInvigilatorOptions).not.toHaveBeenCalled()
    expect(r.invigilators).toEqual([])
  })

  it('reads the summary before the roster', async () => {
    await loadSittingPage(SID, { q: 'ann', show: 'needs_code', page: 2 })
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    const r = m.getRoster.mock.invocationCallOrder[0] as number
    expect(s).toBeLessThan(r)
  })

  it('reads the roster with the parsed q, show and page', async () => {
    await loadSittingPage(SID, { q: 'ann', show: 'needs_code', page: 2 })
    expect(m.getRoster).toHaveBeenCalledWith(
      expect.objectContaining({ sittingId: SID, q: 'ann', show: 'needs_code', page: 2 }),
    )
    expect(m.getRemoved).toHaveBeenCalledWith(SID)
  })

  it.each(['scheduled', 'open', 'closed', 'cancelled'])(
    'reads roster and removed list for a %s sitting',
    async (status) => {
      m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
      const r = await loadSittingPage(SID, { show: 'all', page: 1 })
      expect(m.getRoster).toHaveBeenCalledTimes(1)
      expect(m.getRemoved).toHaveBeenCalledTimes(1)
      expect(r.roster).toEqual({ rows: [], total: 0 })
      expect(r.removed).toEqual({ rows: [], total: 0 })
    },
  )

  it('returns 404 without reading the roster for a non-uuid id', async () => {
    await expect(loadSittingPage('nope', { show: 'all', page: 1 })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(m.getRoster).not.toHaveBeenCalled()
  })
})
