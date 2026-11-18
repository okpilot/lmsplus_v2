import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockGroups = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/app/app/admin/students/groups/queries', () => ({ getGroupsWithCounts: mockGroups }))

import {
  candidateIds,
  getGroupAddCounts,
  getIssuePreview,
  getSameDayPeople,
  getSubjectEligibility,
  listCourseOptions,
  listGroupOptions,
  listPeople,
  resolveSelection,
} from './people-queries'

const uid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`
const SID = uid(1)
const U1 = uid(11)
const U2 = uid(12)

function chain(result: { data: unknown; error: { message: string } | null }) {
  const b = Promise.resolve(result) as unknown as Record<string, unknown>
  for (const m of ['select', 'eq', 'is', 'in', 'order']) b[m] = vi.fn().mockReturnValue(b)
  return b as Record<string, ReturnType<typeof vi.fn>>
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc, from: mockFrom },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('listPeople', () => {
  const rpcRow = {
    user_id: U1,
    full_name: 'Ann Pilot',
    email: 'ann@example.com',
    deactivated: false,
    groups: 'G1',
    courses: 'PPL',
    total_count: 120,
  }

  it('calls list_exam_sitting_people with filters, the page offset and status active by default', async () => {
    mockRpc.mockResolvedValue({ data: [rpcRow], error: null })
    await listPeople({ sittingId: SID, q: 'ann', group: uid(5), course: uid(6), page: 2 })
    expect(mockRpc).toHaveBeenCalledWith('list_exam_sitting_people', {
      p_sitting_id: SID,
      p_q: 'ann',
      p_group_id: uid(5),
      p_course_id: uid(6),
      p_status: 'active',
      p_limit: 50,
      p_offset: 50,
    })
  })

  it('omits unset filters and passes status inactive through', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await listPeople({ sittingId: SID, status: 'inactive', page: 1 })
    expect(mockRpc).toHaveBeenCalledWith('list_exam_sitting_people', {
      p_sitting_id: SID,
      p_status: 'inactive',
      p_limit: 50,
      p_offset: 0,
    })
  })

  it('maps rows and the total', async () => {
    mockRpc.mockResolvedValue({
      data: [rpcRow, { ...rpcRow, user_id: U2, full_name: null }],
      error: null,
    })
    expect(await listPeople({ sittingId: SID, page: 1 })).toEqual({
      rows: [
        {
          userId: U1,
          name: 'Ann Pilot',
          email: 'ann@example.com',
          deactivated: false,
          groups: 'G1',
          courses: 'PPL',
        },
        {
          userId: U2,
          name: '',
          email: 'ann@example.com',
          deactivated: false,
          groups: 'G1',
          courses: 'PPL',
        },
      ],
      total: 120,
      page: 1,
    })
  })

  it('returns an empty page with total 0 when there are no rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await listPeople({ sittingId: SID, page: 1 })).toEqual({ rows: [], total: 0, page: 1 })
  })

  it('snaps a page past the end to the last page', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [rpcRow], error: null })
      .mockResolvedValueOnce({ data: [{ ...rpcRow, user_id: U2 }], error: null })
    const res = await listPeople({ sittingId: SID, page: 9 })
    expect(mockRpc.mock.calls.map((c) => c[1].p_offset)).toEqual([400, 0, 100])
    expect(res).toMatchObject({ total: 120, page: 3, rows: [{ userId: U2 }] })
  })

  it('snaps to page 1 without a third read when everything fits one page', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ ...rpcRow, total_count: 7 }], error: null })
    const res = await listPeople({ sittingId: SID, page: 4 })
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({ total: 7, page: 1 })
  })

  it('returns an empty page 1 when nobody matches past the end', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await listPeople({ sittingId: SID, page: 3 })).toEqual({ rows: [], total: 0, page: 1 })
  })

  it('returns Ended when a snap read finds the sitting closed', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'sitting_closed' } })
    expect(await listPeople({ sittingId: SID, page: 3 })).toEqual({ ended: true })
  })

  it('returns null when the sitting is not found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_not_found' } })
    expect(await listPeople({ sittingId: SID, page: 1 })).toBeNull()
  })

  it.each(['sitting_closed', 'sitting_day_ended'])(
    'maps %s to { ended: true } (AC 60)',
    async (message) => {
      mockRpc.mockResolvedValue({ data: null, error: { message } })
      expect(await listPeople({ sittingId: SID, page: 1 })).toEqual({ ended: true })
    },
  )

  it('logs and throws for any other error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(listPeople({ sittingId: SID, page: 1 })).rejects.toThrow('Failed to load people')
    expect(console.error).toHaveBeenCalled()
  })

  it('rejects an invalid query before calling the RPC', async () => {
    await expect(listPeople({ sittingId: 'x', page: 1 })).rejects.toThrow()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('getSubjectEligibility', () => {
  const row = {
    subject_id: uid(21),
    subject_name: 'Flight Performance',
    subject_short: 'FPM',
    course_id: uid(31),
    course_name: 'PPL',
    people: 2,
    eligible: 1,
    entered_here: 0,
    passed: 1,
    attempt_running: 0,
    entered_elsewhere: 0,
    not_enrolled: 0,
    deactivated: 0,
    state: null,
    attempt_count: null,
    passed_at: null,
    passed_score: null,
    elsewhere_sitting_id: null,
    elsewhere_at: null,
  }

  it('sends explicit ids as p_user_ids and omits it for all candidates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await getSubjectEligibility(SID, [U1])
    expect(mockRpc).toHaveBeenLastCalledWith('get_exam_sitting_subject_eligibility', {
      p_sitting_id: SID,
      p_user_ids: [U1],
    })
    await getSubjectEligibility(SID)
    expect(mockRpc).toHaveBeenLastCalledWith('get_exam_sitting_subject_eligibility', {
      p_sitting_id: SID,
    })
  })

  it('maps the per-subject counts and single-person detail columns', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...row, state: 'passed', passed_at: '2026-11-01T10:00:00Z', passed_score: 88 }],
      error: null,
    })
    const r = await getSubjectEligibility(SID, [U1])
    expect(r).toEqual([
      {
        subjectId: uid(21),
        subjectName: 'Flight Performance',
        subjectShort: 'FPM',
        courseId: uid(31),
        courseName: 'PPL',
        people: 2,
        eligible: 1,
        enteredHere: 0,
        passed: 1,
        attemptRunning: 0,
        enteredElsewhere: 0,
        notEnrolled: 0,
        deactivated: 0,
        state: 'passed',
        attemptCount: null,
        passedAt: '2026-11-01T10:00:00Z',
        passedScore: 88,
        elsewhereSittingId: null,
        elsewhereAt: null,
      },
    ])
  })

  it('rejects more than 100 explicit ids before calling the RPC', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => uid(100 + i))
    await expect(getSubjectEligibility(SID, ids)).rejects.toThrow()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns null / ended for not found / closed', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_not_found' } })
    expect(await getSubjectEligibility(SID)).toBeNull()
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_closed' } })
    expect(await getSubjectEligibility(SID)).toEqual({ ended: true })
  })

  it('throws for invalid_input', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invalid_input' } })
    await expect(getSubjectEligibility(SID, [U1])).rejects.toThrow('Failed to load exams')
  })
})

describe('getIssuePreview', () => {
  it('groups counts by reason, reads students_to_issue and maps detail rows', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          row_kind: 'count',
          reason: 'issue',
          n: 3,
          entry_id: null,
          student_name: null,
          subject_short: null,
        },
        {
          row_kind: 'count',
          reason: 'passed',
          n: 1,
          entry_id: null,
          student_name: null,
          subject_short: null,
        },
        {
          row_kind: 'students_to_issue',
          reason: null,
          n: 2,
          entry_id: null,
          student_name: null,
          subject_short: null,
        },
        {
          row_kind: 'detail',
          reason: 'passed',
          n: 1,
          entry_id: 'e1',
          student_name: 'Ann',
          subject_short: 'FPM',
        },
      ],
      error: null,
    })
    expect(await getIssuePreview(SID, [U1])).toEqual({
      counts: { issue: 3, passed: 1 },
      studentsToIssue: 2,
      details: [{ entryId: 'e1', student: 'Ann', subjectShort: 'FPM', reason: 'passed' }],
    })
    expect(mockRpc).toHaveBeenCalledWith('get_exam_sitting_issue_preview', {
      p_sitting_id: SID,
      p_user_ids: [U1],
    })
  })

  it('omits p_user_ids for the whole sitting and returns zero counts when empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await getIssuePreview(SID)).toEqual({ counts: {}, studentsToIssue: 0, details: [] })
    expect(mockRpc).toHaveBeenCalledWith('get_exam_sitting_issue_preview', { p_sitting_id: SID })
  })

  it('maps ended and not found', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_day_ended' } })
    expect(await getIssuePreview(SID)).toEqual({ ended: true })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_not_found' } })
    expect(await getIssuePreview(SID)).toBeNull()
  })
})

describe('getGroupAddCounts', () => {
  it('maps the active and deactivated new counts', async () => {
    mockRpc.mockResolvedValue({ data: [{ active_new: 4, deactivated_new: 1 }], error: null })
    expect(await getGroupAddCounts(SID, uid(5))).toEqual({ activeNew: 4, deactivatedNew: 1 })
    expect(mockRpc).toHaveBeenCalledWith('get_exam_sitting_group_add_counts', {
      p_sitting_id: SID,
      p_group_id: uid(5),
    })
  })

  it('maps ended, and a missing group or sitting to null', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_closed' } })
    expect(await getGroupAddCounts(SID, uid(5))).toEqual({ ended: true })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'group_not_found' } })
    expect(await getGroupAddCounts(SID, uid(5))).toBeNull()
  })
})

describe('getSameDayPeople', () => {
  it('maps rows and passes explicit ids', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { user_id: U1, full_name: 'Ann', sitting_id: uid(2), scheduled_at: '2026-11-18T09:30:00Z' },
      ],
      error: null,
    })
    expect(await getSameDayPeople(SID, [U1])).toEqual([
      { userId: U1, name: 'Ann', sittingId: uid(2), scheduledAt: '2026-11-18T09:30:00Z' },
    ])
    expect(mockRpc).toHaveBeenCalledWith('get_exam_sitting_same_day_people', {
      p_sitting_id: SID,
      p_user_ids: [U1],
    })
  })

  it('omits p_user_ids for all candidates and maps ended', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await getSameDayPeople(SID)).toEqual([])
    expect(mockRpc).toHaveBeenCalledWith('get_exam_sitting_same_day_people', { p_sitting_id: SID })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'sitting_closed' } })
    expect(await getSameDayPeople(SID)).toEqual({ ended: true })
  })
})

describe('listCourseOptions and listGroupOptions', () => {
  it('reads courses in sort order through the user client', async () => {
    const b = chain({ data: [{ id: 'c1', name: 'PPL', short: 'PPL' }], error: null })
    mockFrom.mockReturnValue(b)
    expect(await listCourseOptions()).toEqual([{ id: 'c1', name: 'PPL' }])
    expect(mockFrom).toHaveBeenCalledWith('courses')
    expect(b.order).toHaveBeenCalledWith('sort_order')
  })

  it('throws when the courses read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'x' } }))
    await expect(listCourseOptions()).rejects.toThrow('Failed to load courses')
  })

  it('maps the groups with their counts', async () => {
    mockGroups.mockResolvedValue([
      {
        id: 'g1',
        name: 'Class A',
        description: null,
        active_count: 3,
        deactivated_count: 1,
        created_at: 'x',
      },
    ])
    expect(await listGroupOptions()).toEqual([{ id: 'g1', name: 'Class A' }])
  })
})

describe('candidateIds', () => {
  it('reads live candidates of the sitting with an organization predicate', async () => {
    const b = chain({ data: [{ user_id: U1 }, { user_id: U2 }], error: null })
    mockFrom.mockReturnValue(b)
    const { supabase } = await mockRequireAdmin()
    expect(await candidateIds(supabase, 'o', { sittingId: SID })).toEqual([U1, U2])
    expect(mockFrom).toHaveBeenCalledWith('exam_sitting_candidates')
    expect(b.eq).toHaveBeenCalledWith('sitting_id', SID)
    expect(b.eq).toHaveBeenCalledWith('organization_id', 'o')
    expect(b.is).toHaveBeenCalledWith('deleted_at', null)
    expect(b.in).not.toHaveBeenCalled()
  })

  it('narrows to the given ids', async () => {
    const b = chain({ data: [{ user_id: U1 }], error: null })
    mockFrom.mockReturnValue(b)
    const { supabase } = await mockRequireAdmin()
    await candidateIds(supabase, 'o', { sittingId: SID, ids: [U1, U2] })
    expect(b.in).toHaveBeenCalledWith('user_id', [U1, U2])
  })

  it('throws when the read fails', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'x' } }))
    const { supabase } = await mockRequireAdmin()
    await expect(candidateIds(supabase, 'o', { sittingId: SID })).rejects.toThrow()
  })
})

describe('resolveSelection (D-b2)', () => {
  const sel = (over: Record<string, unknown> = {}) => ({
    present: false,
    all: false,
    ids: [] as string[],
    truncated: false,
    ...over,
  })

  it('all wins and reads nothing', async () => {
    expect(await resolveSelection(SID, 'exams', sel({ present: true, all: true }))).toEqual({
      kind: 'all',
    })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('keeps only the ids that are live candidates and carries truncated', async () => {
    mockFrom.mockReturnValue(chain({ data: [{ user_id: U1 }], error: null }))
    expect(
      await resolveSelection(SID, 'exams', sel({ present: true, ids: [U1, U2], truncated: true })),
    ).toEqual({ kind: 'ids', ids: [U1], truncated: true })
  })

  it.each(['exams', 'issue'] as const)(
    'never widens when ids were sent but none is valid (%s)',
    async (dlg) => {
      mockFrom.mockReturnValue(chain({ data: [], error: null }))
      expect(await resolveSelection(SID, dlg, sel({ present: true, ids: [U1] }))).toEqual({
        kind: 'empty',
      })
    },
  )

  it('is empty without params for exams and the whole sitting for issue', async () => {
    expect(await resolveSelection(SID, 'exams', sel())).toEqual({ kind: 'empty' })
    expect(await resolveSelection(SID, 'issue', sel())).toEqual({ kind: 'whole' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('is empty when ids were sent but none parsed as a uuid, without reading', async () => {
    expect(await resolveSelection(SID, 'issue', sel({ present: true }))).toEqual({ kind: 'empty' })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
