import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockReadUserNames = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../people-lookup', () => ({ readUserNames: mockReadUserNames }))

import { addSittingExams } from './add-exams'

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const SID = uid(1)
const U1 = uid(11)
const U2 = uid(12)
const S1 = uid(21)
const S2 = uid(22)

const rpcRow = (over: Record<string, unknown> = {}) => ({
  added: 0,
  skipped: [],
  skipped_attempt_running: 0,
  skipped_deactivated: 0,
  skipped_entered_elsewhere: 0,
  skipped_existing: 0,
  skipped_not_candidate: 0,
  skipped_not_enrolled: 0,
  skipped_passed: 0,
  ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockReadUserNames.mockResolvedValue(new Map())
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc, from: mockFrom },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('addSittingExams', () => {
  it.each([
    { sittingId: SID, subjectIds: [S1] },
    { sittingId: SID, subjectIds: [S1], userIds: [U1], all: true },
    { sittingId: SID, subjectIds: [], userIds: [U1] },
    { sittingId: SID, subjectIds: [S1, S1], userIds: [U1] },
    { sittingId: 'x', subjectIds: [S1], userIds: [U1] },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await addSittingExams(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not call the RPC for a non-admin caller', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Not authorized'))
    await expect(
      addSittingExams({ sittingId: SID, subjectIds: [S1], userIds: [U1] }),
    ).rejects.toThrow()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sends the users x subjects pairs as equal-length arrays with no duplicate pair', async () => {
    mockRpc.mockResolvedValue({ data: [rpcRow({ added: 4 })], error: null })
    const r = await addSittingExams({ sittingId: SID, subjectIds: [S1, S2], userIds: [U1, U2] })
    const args = mockRpc.mock.calls[0]?.[1] as { p_user_ids: string[]; p_subject_ids: string[] }
    expect(mockRpc.mock.calls[0]?.[0]).toBe('add_exam_sitting_entries')
    expect(args.p_user_ids).toHaveLength(4)
    expect(args.p_subject_ids).toHaveLength(4)
    const pairs = args.p_user_ids.map((u, i) => `${u}:${args.p_subject_ids[i]}`)
    expect(new Set(pairs).size).toBe(4)
    expect(r).toMatchObject({ success: true, added: 4 })
  })

  it('refuses more than 1000 pairs before calling the RPC, with the count copy', async () => {
    const userIds = Array.from({ length: 250 }, (_, i) => uid(1000 + i))
    const subjectIds = Array.from({ length: 5 }, (_, i) => uid(500 + i))
    const r = await addSittingExams({ sittingId: SID, subjectIds, userIds })
    expect(r).toEqual({
      success: false,
      error: 'Too many: 250 people x 5 exams = 1250; the limit is 1000. Untick exams.',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sums the RPC skipped counters into skippedTotal', async () => {
    mockRpc.mockResolvedValue({
      data: [rpcRow({ added: 1, skipped_existing: 2, skipped_not_enrolled: 3 })],
      error: null,
    })
    const r = await addSittingExams({ sittingId: SID, subjectIds: [S1], userIds: [U1] })
    expect(r).toMatchObject({ success: true, added: 1, skippedTotal: 5 })
  })

  it('maps skipped rows with the resolved person name, Unknown fallback and detail_at', async () => {
    mockRpc.mockResolvedValue({
      data: [
        rpcRow({
          skipped_passed: 2,
          skipped: [
            { user_id: U1, subject_id: S1, reason: 'passed', detail_at: '2026-11-01T10:00:00Z' },
            { user_id: U2, subject_id: S1, reason: 'not_enrolled' },
          ],
        }),
      ],
      error: null,
    })
    mockReadUserNames.mockResolvedValue(new Map([[U1, 'Ann Pilot']]))
    const r = await addSittingExams({ sittingId: SID, subjectIds: [S1], userIds: [U1, U2] })
    expect(r).toMatchObject({
      success: true,
      skipped: [
        { person: 'Ann Pilot', subjectId: S1, reason: 'passed', detailAt: '2026-11-01T10:00:00Z' },
        { person: 'Unknown', subjectId: S1, reason: 'not_enrolled' },
      ],
    })
  })

  it('reads names with the organization id', async () => {
    mockRpc.mockResolvedValue({
      data: [
        rpcRow({
          skipped_existing: 1,
          skipped: [{ user_id: U1, subject_id: S1, reason: 'existing' }],
        }),
      ],
      error: null,
    })
    await addSittingExams({ sittingId: SID, subjectIds: [S1], userIds: [U1] })
    expect(mockReadUserNames).toHaveBeenCalledWith('o', [U1])
  })

  it('in all-mode builds pairs from the sitting candidates read with an organization predicate', async () => {
    const eq = vi.fn()
    const chain = Object.assign(
      Promise.resolve({ data: [{ user_id: U1 }, { user_id: U2 }], error: null }),
      { select: vi.fn(), eq, is: vi.fn() },
    )
    chain.select.mockReturnValue(chain)
    eq.mockReturnValue(chain)
    chain.is.mockReturnValue(chain)
    mockFrom.mockReturnValue(chain)
    mockRpc.mockResolvedValue({ data: [rpcRow({ added: 2 })], error: null })
    await addSittingExams({ sittingId: SID, subjectIds: [S1], all: true })
    expect(eq).toHaveBeenCalledWith('organization_id', 'o')
    const args = mockRpc.mock.calls[0]?.[1] as { p_user_ids: string[] }
    expect([...args.p_user_ids].sort()).toEqual([U1, U2])
  })

  it('in all-mode with no candidates says so without calling the RPC', async () => {
    const chain = Object.assign(Promise.resolve({ data: [], error: null }), {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
    })
    for (const k of ['select', 'eq', 'is'] as const) chain[k].mockReturnValue(chain)
    mockFrom.mockReturnValue(chain)
    expect(await addSittingExams({ sittingId: SID, subjectIds: [S1], all: true })).toEqual({
      success: false,
      error: 'No people in this sitting.',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({ data: [rpcRow({ added: 1 })], error: null })
    await addSittingExams({ sittingId: SID, subjectIds: [S1], userIds: [U1] })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })
})
