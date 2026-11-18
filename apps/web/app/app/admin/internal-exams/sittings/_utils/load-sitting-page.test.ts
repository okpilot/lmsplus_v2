import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getSitting: vi.fn(),
  listInvigilatorOptions: vi.fn(),
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
})
