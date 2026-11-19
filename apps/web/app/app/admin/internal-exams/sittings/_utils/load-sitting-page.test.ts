import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getSitting: vi.fn(),
  listInvigilatorOptions: vi.fn(),
  getRoster: vi.fn(),
  getRemoved: vi.fn(),
  resolveSelection: vi.fn(),
  requireAdmin: vi.fn(),
  deliverable: vi.fn(),
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
vi.mock('../people-queries', () => ({ resolveSelection: m.resolveSelection }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: m.requireAdmin }))
vi.mock('../../notice-queries', () => ({ getDeliverablePendingNotices: m.deliverable }))

import type { SittingParams } from '../parse-sitting-params'
import { loadSittingPage } from './load-sitting-page'

const params = (over: Partial<SittingParams> = {}): SittingParams => ({
  show: 'all',
  page: 1,
  selection: { present: false, all: false, ids: [], truncated: false },
  people: { page: 1 },
  ...over,
})

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
  m.resolveSelection.mockResolvedValue({ kind: 'ids', ids: ['u1'], truncated: false })
  m.requireAdmin.mockResolvedValue({ supabase: {}, organizationId: 'org-1', userId: 'a' })
  m.deliverable.mockResolvedValue([])
})

describe('loadSittingPage', () => {
  it('counts the deliverable pending notices, not the summary count', async () => {
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      pendingRemovalNotices: 5,
    })
    m.deliverable.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])
    const r = await loadSittingPage(SID, params())
    expect(m.deliverable).toHaveBeenCalledWith({}, 'org-1', SID)
    expect(r.summary.pendingRemovalNotices).toBe(2)
  })

  it('counts one notice per email: per student for cancellations, per entry for removals', async () => {
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      pendingRemovalNotices: 5,
    })
    m.deliverable.mockResolvedValue([
      { userId: 'u1', subjectId: 's1', codeId: 'c1' },
      { userId: 'u1', subjectId: 's2', codeId: 'c2' },
      { userId: 'u1', subjectId: 's3', codeId: 'c3' },
      {
        kind: 'entry_auto_removed',
        userId: 'u1',
        subjectId: 's4',
        entryId: 'e1',
        passedAt: '2026-11-01T00:00:00Z',
      },
    ])
    const r = await loadSittingPage(SID, params())
    expect(r.summary.pendingRemovalNotices).toBe(2)
  })

  it('skips the pending read when the summary has no pending notices', async () => {
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      pendingRemovalNotices: 0,
    })
    const r = await loadSittingPage(SID, params())
    expect(m.deliverable).not.toHaveBeenCalled()
    expect(r.summary.pendingRemovalNotices).toBe(0)
  })

  it('falls back to the summary count when the pending read throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      pendingRemovalNotices: 5,
    })
    m.deliverable.mockRejectedValue(new Error('db down'))
    const r = await loadSittingPage(SID, params())
    expect(r.summary.pendingRemovalNotices).toBe(5)
    expect(console.error).toHaveBeenCalled()
  })

  it('returns 404 for a non-uuid id without querying', async () => {
    await expect(loadSittingPage('not-a-uuid', params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSummary).not.toHaveBeenCalled()
  })

  it('returns 404 when there is no summary', async () => {
    m.getSummary.mockResolvedValue(null)
    await expect(loadSittingPage(SID, params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getSitting).not.toHaveBeenCalled()
  })

  it('returns 404 when the sitting row is missing', async () => {
    m.getSitting.mockResolvedValue(null)
    await expect(loadSittingPage(SID, params())).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('reads the summary before the sitting', async () => {
    await loadSittingPage(SID, params())
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    const g = m.getSitting.mock.invocationCallOrder[0] as number
    expect(s).toBeLessThan(g)
  })

  it('returns sitting, summary, invigilators and notDue for a future sitting', async () => {
    m.getSitting.mockResolvedValue({ id: SID, scheduledAt: '2999-01-01T09:00:00Z' })
    const r = await loadSittingPage(SID, params())
    expect(r.invigilators).toEqual([{ id: 'i1', name: 'Ann' }])
    expect(r.summary).toMatchObject({ status: 'scheduled' })
    expect(r.notDue).toBe(true)
  })

  it('is not notDue for a past sitting', async () => {
    m.getSitting.mockResolvedValue({ id: SID, scheduledAt: '2020-01-01T09:00:00Z' })
    expect((await loadSittingPage(SID, params())).notDue).toBe(false)
  })

  it.each(['scheduled', 'open'])('loads invigilator options for a %s sitting', async (status) => {
    m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
    await loadSittingPage(SID, params())
    expect(m.listInvigilatorOptions).toHaveBeenCalledTimes(1)
  })

  it('skips invigilator options when the day has ended', async () => {
    m.getSummary.mockResolvedValue({
      status: 'scheduled',
      scheduledAt: '2026-11-20T09:30:00Z',
      dayEnded: true,
    })
    const r = await loadSittingPage(SID, params())
    expect(m.listInvigilatorOptions).not.toHaveBeenCalled()
    expect(r.invigilators).toEqual([])
  })

  it.each(['closed', 'cancelled'])('skips invigilator options for a %s sitting', async (status) => {
    m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
    const r = await loadSittingPage(SID, params())
    expect(m.listInvigilatorOptions).not.toHaveBeenCalled()
    expect(r.invigilators).toEqual([])
  })

  it('reads the summary before the roster', async () => {
    await loadSittingPage(SID, params({ q: 'ann', show: 'needs_code', page: 2 }))
    const s = m.getSummary.mock.invocationCallOrder[0] as number
    const r = m.getRoster.mock.invocationCallOrder[0] as number
    expect(s).toBeLessThan(r)
  })

  it('reads the roster with the parsed q, show and page', async () => {
    await loadSittingPage(SID, params({ q: 'ann', show: 'needs_code', page: 2 }))
    expect(m.getRoster).toHaveBeenCalledWith(
      expect.objectContaining({ sittingId: SID, q: 'ann', show: 'needs_code', page: 2 }),
    )
    expect(m.getRemoved).toHaveBeenCalledWith(SID)
  })

  it.each(['scheduled', 'open', 'closed', 'cancelled'])(
    'reads roster and removed list for a %s sitting',
    async (status) => {
      m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z' })
      const r = await loadSittingPage(SID, params())
      expect(m.getRoster).toHaveBeenCalledTimes(1)
      expect(m.getRemoved).toHaveBeenCalledTimes(1)
      expect(r.roster).toEqual({ rows: [], total: 0 })
      expect(r.removed).toEqual({ rows: [], total: 0 })
    },
  )

  it('returns 404 without reading the roster for a non-uuid id', async () => {
    await expect(loadSittingPage('nope', params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect(m.getRoster).not.toHaveBeenCalled()
  })
})

describe('loadSittingPage selection (AC 35, 51, 59)', () => {
  const sel = { present: true, all: false, ids: ['u1'], truncated: false }

  it('resolves the selection once for an editable sitting with dlg=exams', async () => {
    const r = await loadSittingPage(SID, params({ dlg: 'exams', selection: sel }))
    expect(m.resolveSelection).toHaveBeenCalledTimes(1)
    expect(m.resolveSelection).toHaveBeenCalledWith(SID, 'exams', sel)
    expect(r.selection).toEqual({ kind: 'ids', ids: ['u1'], truncated: false })
  })

  it('resolves it for dlg=issue', async () => {
    await loadSittingPage(SID, params({ dlg: 'issue', selection: sel }))
    expect(m.resolveSelection).toHaveBeenCalledWith(SID, 'issue', sel)
  })

  it.each([undefined, 'people' as const])('does not resolve it for dlg=%s', async (dlg) => {
    const r = await loadSittingPage(SID, params({ dlg, selection: sel }))
    expect(m.resolveSelection).not.toHaveBeenCalled()
    expect(r.selection).toEqual({ kind: 'empty' })
  })

  it.each([
    ['closed', false],
    ['cancelled', false],
    ['scheduled', true],
  ])(
    'does not query popup data for a non-editable %s sitting (day ended: %s)',
    async (status, dayEnded) => {
      m.getSummary.mockResolvedValue({ status, scheduledAt: '2026-11-20T09:30:00Z', dayEnded })
      if (status === 'scheduled') {
        const r = await loadSittingPage(SID, params({ dlg: 'exams', selection: sel }))
        expect(r.editable).toBe(false)
      } else {
        await loadSittingPage(SID, params({ dlg: 'exams', selection: sel }))
      }
      expect(m.resolveSelection).not.toHaveBeenCalled()
    },
  )
})
