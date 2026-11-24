import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getRosterAll: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next/navigation', () => ({ notFound: m.notFound }))
vi.mock('../queries', () => ({ getSummary: m.getSummary }))
vi.mock('../roster-queries', () => ({ getRosterAll: m.getRosterAll }))

import { loadPrintPage } from './load-print-page'

const SID = '00000000-0000-4000-a000-0000000000a1'
const entry = (over: Record<string, unknown>) => ({
  entryId: 'e',
  status: 'ready',
  code: 'LIVE1234',
  ...over,
})
const person = (userId: string, entries: unknown[]) => ({ userId, entries })

beforeEach(() => {
  vi.resetAllMocks()
  m.notFound.mockImplementation(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
  m.getSummary.mockResolvedValue({
    status: 'scheduled',
    scheduledAt: '2026-11-18T09:30:00Z',
    dayEnded: false,
  })
  m.getRosterAll.mockResolvedValue([])
})

describe('loadPrintPage', () => {
  it('404s a non-uuid id without reading', async () => {
    await expect(loadPrintPage('nope')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSummary).not.toHaveBeenCalled()
  })

  it('404s a missing sitting without reading the roster', async () => {
    m.getSummary.mockResolvedValue(null)
    await expect(loadPrintPage(SID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getRosterAll).not.toHaveBeenCalled()
  })

  it('404s when the sitting day has ended', async () => {
    m.getSummary.mockResolvedValue({ status: 'open', scheduledAt: 'x', dayEnded: true })
    await expect(loadPrintPage(SID)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getRosterAll).not.toHaveBeenCalled()
  })

  it.each(['closed', 'cancelled'])(
    '404s a %s sitting without reading the roster',
    async (status) => {
      m.getSummary.mockResolvedValue({ status, scheduledAt: 'x', dayEnded: false })
      await expect(loadPrintPage(SID)).rejects.toThrow('NEXT_NOT_FOUND')
      expect(m.getRosterAll).not.toHaveBeenCalled()
    },
  )

  it('keeps live coded entries only and drops people left with none', async () => {
    m.getRosterAll.mockResolvedValue([
      person('u1', [
        entry({ entryId: 'e1' }),
        entry({ entryId: 'e2', status: 'waiting' }),
        entry({ entryId: 'e3', status: 'expired', code: null }),
        entry({ entryId: 'e4', status: 'finished', code: 'USED9999' }),
        entry({ entryId: 'e5', code: null }),
      ]),
      person('u2', [entry({ entryId: 'e6', status: 'expired', code: null })]),
      person('u3', []),
    ])
    const r = await loadPrintPage(SID)
    expect(r.sittingId).toBe(SID)
    expect(r.scheduledAt).toBe('2026-11-18T09:30:00Z')
    expect(r.people.map((p) => p.userId)).toEqual(['u1'])
    expect(r.people[0]?.entries.map((e) => e.entryId)).toEqual(['e1', 'e2'])
  })

  it('skips deactivated people', async () => {
    m.getRosterAll.mockResolvedValue([
      { ...person('u1', [entry({ entryId: 'e1' })]), deactivated: true },
      { ...person('u2', [entry({ entryId: 'e2' })]), deactivated: false },
    ])
    const r = await loadPrintPage(SID)
    expect(r.people.map((p) => p.userId)).toEqual(['u2'])
  })

  it('accepts an open sitting', async () => {
    m.getSummary.mockResolvedValue({ status: 'open', scheduledAt: 'x', dayEnded: false })
    await expect(loadPrintPage(SID)).resolves.toMatchObject({ people: [] })
  })
})
