import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { getRemoved, getRoster, getRosterAll } from './roster-queries'
import { ENTRY_STATUSES } from './types'

const SID = '00000000-0000-4000-a000-0000000000a1'

const ENTRY = {
  entry_id: 'e1',
  subject_id: 's1',
  subject_short: 'FPM',
  subject_name: 'Flight Performance',
  course_id: 'c1',
  course_name: 'PPL',
  status: 'ready',
  attempt_number: null,
  passed: null,
  score: null,
  code_id: 'k1',
  code: 'ABCD1234',
  code_expires_at: '2026-11-18T23:59:00Z',
  code_emailed_at: null,
  void_reason: null,
  session_id: null,
  session_started_at: null,
}

function rosterRow(over: Record<string, unknown> = {}) {
  return {
    user_id: 'u1',
    full_name: 'Ann Student',
    email: 'ann@example.com',
    deactivated: false,
    has_attempt: false,
    entries: [ENTRY],
    total_count: 120,
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('getRoster', () => {
  it('calls list_exam_sitting_roster with page size 50 and the offset of the page', async () => {
    mockRpc.mockResolvedValue({ data: [rosterRow()], error: null })
    await getRoster({ sittingId: SID, q: 'ann', show: 'all', page: 2 })
    expect(mockRpc).toHaveBeenCalledWith('list_exam_sitting_roster', {
      p_sitting_id: SID,
      p_q: 'ann',
      p_limit: 50,
      p_offset: 50,
      p_show: 'all',
    })
  })

  it.each([
    ['all', 'all'],
    ['needs_code', 'needs_code'],
    ['attempts', 'has_attempts'],
  ])('maps the URL show value %s to the RPC value %s', async (show, rpcShow) => {
    mockRpc.mockResolvedValue({ data: [rosterRow()], error: null })
    await getRoster({ sittingId: SID, show: show as never, page: 1 })
    expect(mockRpc).toHaveBeenCalledWith(
      'list_exam_sitting_roster',
      expect.objectContaining({ p_show: rpcShow }),
    )
  })

  it('maps rows, entries (camelCase) and the filtered total', async () => {
    mockRpc.mockResolvedValue({ data: [rosterRow()], error: null })
    const r = await getRoster({ sittingId: SID, page: 1 })
    expect(r?.total).toBe(120)
    expect(r?.rows[0]).toMatchObject({
      userId: 'u1',
      name: 'Ann Student',
      email: 'ann@example.com',
      deactivated: false,
      hasAttempt: false,
    })
    expect(r?.rows[0]?.entries[0]).toMatchObject({
      entryId: 'e1',
      subjectShort: 'FPM',
      subjectName: 'Flight Performance',
      status: 'ready',
      code: 'ABCD1234',
      codeExpiresAt: '2026-11-18T23:59:00Z',
      codeEmailedAt: null,
      sessionId: null,
    })
  })

  it('drops a malformed jsonb entry and keeps the valid ones', async () => {
    mockRpc.mockResolvedValue({
      data: [rosterRow({ entries: [ENTRY, { entry_id: 5 }, null, 'x'] })],
      error: null,
    })
    const r = await getRoster({ sittingId: SID, page: 1 })
    expect(r?.rows[0]?.entries).toHaveLength(1)
  })

  it('keeps an entry for every ENTRY_STATUSES value and drops an unknown status', async () => {
    const all = [
      'no_code',
      'waiting',
      'ready',
      'expired',
      'voided',
      'voided_attempt',
      'running',
      'finished',
      'absent',
      'discarded',
    ]
    expect([...ENTRY_STATUSES]).toEqual(all)
    const entries = [
      ...all.map((status, i) => ({ ...ENTRY, entry_id: `e${i}`, status })),
      { ...ENTRY, entry_id: 'bad', status: 'bogus' },
    ]
    mockRpc.mockResolvedValue({ data: [rosterRow({ entries })], error: null })
    const r = await getRoster({ sittingId: SID, page: 1 })
    expect(r?.rows[0]?.entries.map((e) => e.status)).toEqual(all)
  })

  it('returns an empty roster with total 0 when no row matches', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await getRoster({ sittingId: SID, page: 1 })).toEqual({ rows: [], total: 0 })
  })

  it('snaps a page past the end to the last page', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [rosterRow({ total_count: 120 })], error: null })
      .mockResolvedValueOnce({ data: [rosterRow({ total_count: 120 })], error: null })
    const r = await getRoster({ sittingId: SID, page: 9 })
    expect(r?.rows).toHaveLength(1)
    const last = mockRpc.mock.calls.at(-1) as [string, { p_offset: number }]
    expect(last[1].p_offset).toBe(100)
  })

  it('returns null for sitting_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_not_found' } })
    expect(await getRoster({ sittingId: SID, page: 1 })).toBeNull()
  })

  it('throws for any other RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getRoster({ sittingId: SID, page: 1 })).rejects.toThrow()
  })
})

describe('getRosterAll', () => {
  it('reads pages of 100 until the total is covered and merges them', async () => {
    const page = (start: number, n: number) =>
      Array.from({ length: n }, (_, i) => rosterRow({ user_id: `u${start + i}`, total_count: 250 }))
    mockRpc
      .mockResolvedValueOnce({ data: page(0, 100), error: null })
      .mockResolvedValueOnce({ data: page(100, 100), error: null })
      .mockResolvedValueOnce({ data: page(200, 50), error: null })
    const rows = await getRosterAll(SID)
    expect(mockRpc).toHaveBeenCalledTimes(3)
    expect(mockRpc.mock.calls.map((c) => (c[1] as { p_limit: number }).p_limit)).toEqual([
      100, 100, 100,
    ])
    expect(mockRpc.mock.calls.map((c) => (c[1] as { p_offset: number }).p_offset)).toEqual([
      0, 100, 200,
    ])
    expect(rows).toHaveLength(250)
    expect(new Set(rows.map((r) => r.userId)).size).toBe(250)
  })
})

describe('getRemoved', () => {
  const REMOVED = {
    entry_id: 'e1',
    user_id: 'u1',
    student_name: 'Ann Student',
    subject_short: 'FPM',
    passed_at: '2026-11-17T10:00:00Z',
    removed_at: '2026-11-17T10:01:00Z',
    notice_sent: false,
    total_count: 3,
  }

  it('maps a NULL subject_short (soft-deleted subject) to an empty string', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...REMOVED, subject_short: null }], error: null })
    const r = await getRemoved(SID)
    expect(r?.rows[0]?.subjectShort).toBe('')
  })

  it('maps rows and the total', async () => {
    mockRpc.mockResolvedValue({ data: [REMOVED], error: null })
    const r = await getRemoved(SID)
    expect(mockRpc).toHaveBeenCalledWith('list_exam_sitting_removed_entries', { p_sitting_id: SID })
    expect(r?.total).toBe(3)
    expect(r?.rows[0]).toMatchObject({
      entryId: 'e1',
      studentName: 'Ann Student',
      subjectShort: 'FPM',
      passedAt: '2026-11-17T10:00:00Z',
      noticeSent: false,
      noNotice: false,
    })
  })

  it('maps no_notice true to noNotice true', async () => {
    mockRpc.mockResolvedValue({ data: [{ ...REMOVED, no_notice: true }], error: null })
    expect((await getRemoved(SID))?.rows[0]?.noNotice).toBe(true)
  })

  it('maps an absent no_notice column to noNotice false', async () => {
    mockRpc.mockResolvedValue({ data: [REMOVED], error: null })
    expect((await getRemoved(SID))?.rows[0]?.noNotice).toBe(false)
  })

  it('returns zero rows and total 0 when nothing was auto-removed', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await getRemoved(SID)).toEqual({ rows: [], total: 0 })
  })

  it('returns null for sitting_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_not_found' } })
    expect(await getRemoved(SID)).toBeNull()
  })
})
