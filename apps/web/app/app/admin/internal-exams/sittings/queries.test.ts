import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  cache: <T>(f: T) => f,
}))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { getSitting, getSummary, listSittings } from './queries'

const ORG = 'org-001'
const SID = '00000000-0000-4000-a000-0000000000a1'

function chain(result: { data: unknown; error: { message: string } | null }) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) b[m] = vi.fn().mockReturnValue(b)
  b.maybeSingle = vi.fn().mockResolvedValue(result)
  b.single = vi.fn().mockResolvedValue(result)
  // biome-ignore lint/suspicious/noThenProperty: thenable query builder mock
  b.then = (cb: (v: unknown) => unknown) => Promise.resolve(result).then(cb)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc, from: mockFrom },
    organizationId: ORG,
    userId: 'a',
  })
})

const RPC_ROW = {
  id: SID,
  scheduled_at: '2026-11-20T09:30:00Z',
  mode: 'remote',
  status: 'scheduled',
  invigilator_id: 'inv-1',
  invigilator_name: 'Ann Instructor',
  invigilator_active: false,
  permitted_materials: null,
  started_at: null,
  closed_at: null,
  candidates: 5,
  entries: 7,
  entries_without_code: 2,
  entries_finished: 0,
  entries_absent: 0,
  ended_automatically: false,
  total_count: 61,
}

describe('listSittings', () => {
  it('calls list_exam_sittings with the scope and page size 50', async () => {
    mockRpc.mockResolvedValue({ data: [RPC_ROW], error: null })
    await listSittings('open')
    expect(mockRpc).toHaveBeenCalledWith(
      'list_exam_sittings',
      expect.objectContaining({ p_scope: 'open', p_limit: 50 }),
    )
  })

  it('maps rows to camelCase and returns total_count', async () => {
    mockRpc.mockResolvedValue({ data: [RPC_ROW], error: null })
    const r = await listSittings('upcoming')
    expect(r.totalCount).toBe(61)
    expect(r.rows[0]).toMatchObject({
      id: SID,
      scheduledAt: RPC_ROW.scheduled_at,
      invigilatorName: 'Ann Instructor',
      invigilatorActive: false,
      candidates: 5,
      entries: 7,
      entriesWithoutCode: 2,
    })
  })

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(listSittings('past')).rejects.toThrow()
  })
})

describe('getSummary', () => {
  it('returns null when the sitting is not found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_not_found' } })
    expect(await getSummary(SID)).toBeNull()
  })

  it('throws on any other RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getSummary(SID)).rejects.toThrow()
  })

  it('maps the summary row to camelCase', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: 'open',
          scheduled_at: '2026-11-20T09:30:00Z',
          candidates: 4,
          deactivated_candidates: 0,
          entries: 6,
          entries_without_code: 1,
          codes_issued: 5,
          entries_with_attempt: 0,
          pending_removal_notices: 0,
          day_ended: true,
          attempts_running: 2,
          entries_not_started: 3,
          students_not_started: 2,
          entries_issuable: 1,
        },
      ],
      error: null,
    })
    expect(await getSummary(SID)).toMatchObject({
      status: 'open',
      candidates: 4,
      entries: 6,
      codesIssued: 5,
      dayEnded: true,
      attemptsRunning: 2,
      entriesNotStarted: 3,
      studentsNotStarted: 2,
    })
  })
})

describe('getSitting', () => {
  it('reads a cancelled sitting scoped by organization and id', async () => {
    const sitting = chain({
      data: {
        id: SID,
        scheduled_at: '2026-11-20T09:30:00Z',
        mode: 'in_person',
        status: 'cancelled',
        invigilator_id: 'inv-1',
        permitted_materials: 'Notes',
        started_at: null,
        closed_at: null,
        ended_automatically: false,
      },
      error: null,
    })
    const users = chain({ data: { full_name: 'Ann Instructor', deleted_at: null }, error: null })
    mockFrom.mockImplementation((t: string) => (t === 'exam_sittings' ? sitting : users))
    const r = await getSitting(SID)
    expect(r).toMatchObject({ id: SID, status: 'cancelled', mode: 'in_person' })
    const eqArgs = (sitting.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqArgs).toContainEqual(['organization_id', ORG])
    expect(eqArgs).toContainEqual(['id', SID])
  })

  it('returns null when no sitting row exists', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    expect(await getSitting(SID)).toBeNull()
  })
})
