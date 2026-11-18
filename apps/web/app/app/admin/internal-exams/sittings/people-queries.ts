import { SittingPeopleQuerySchema, SubjectEligibilityQuerySchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isEnded } from './_utils/is-ended'
import type { SelectionParams } from './parse-sitting-params'
import {
  type AddablePerson,
  ENDED,
  type Ended,
  type GroupAddCounts,
  type IssuePreview,
  PEOPLE_PAGE_SIZE,
  type SameDayPerson,
  type Selection,
  type SubjectEligibility,
} from './types'

type Supabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

/** Not found -> null, closed or day ended -> `{ ended: true }`; anything else is logged and thrown. */
function readFailure(name: string, message: string, fallback: string): Ended | null {
  if (message === 'sitting_not_found') return null
  if (message === 'sitting_closed' || message === 'sitting_day_ended') return ENDED
  console.error(`[${name}] RPC error:`, message)
  throw new Error(fallback)
}

type PeoplePage = { rows: AddablePerson[]; total: number; page: number }
type PeopleQuery = ReturnType<typeof SittingPeopleQuerySchema.parse>
type PeopleRpcRow = {
  user_id: string
  full_name: string | null
  email: string
  deactivated: boolean
  groups: string
  courses: string
  total_count: number
}

/** One page of the people RPC; null when the sitting is not found. */
async function fetchPeople(
  supabase: Supabase,
  query: PeopleQuery,
  page: number,
): Promise<PeopleRpcRow[] | Ended | null> {
  const { data, error } = await supabase.rpc('list_exam_sitting_people', {
    p_sitting_id: query.sittingId,
    ...(query.q ? { p_q: query.q } : {}),
    ...(query.groupId ? { p_group_id: query.groupId } : {}),
    ...(query.courseId ? { p_course_id: query.courseId } : {}),
    p_status: query.status,
    p_limit: PEOPLE_PAGE_SIZE,
    p_offset: (page - 1) * PEOPLE_PAGE_SIZE,
  })
  if (error) return readFailure('listPeople', error.message, 'Failed to load people')
  return data ?? []
}

const totalOf = (rows: readonly PeopleRpcRow[]) => Number(rows[0]?.total_count ?? 0)

/** The page to show when `page` is past the end: the last page, or null-total when nobody matches. */
async function snapToLast(supabase: Supabase, query: PeopleQuery) {
  const first = await fetchPeople(supabase, query, 1)
  if (first === null || isEnded(first)) return first
  const total = totalOf(first)
  if (total === 0) return { rows: first, page: 1 }
  const last = Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE))
  if (last === 1) return { rows: first, page: 1 }
  const rows = await fetchPeople(supabase, query, last)
  return rows === null || isEnded(rows) ? rows : { rows, page: last }
}

/** A page of addable people (not yet in the sitting), 50 per page, status Active unless told otherwise; a page past the end snaps to the last page. */
export async function listPeople(a: {
  sittingId: string
  q?: string
  group?: string
  course?: string
  status?: 'active' | 'inactive'
  page: number
}): Promise<PeoplePage | Ended | null> {
  const query = SittingPeopleQuerySchema.parse({
    sittingId: a.sittingId,
    q: a.q,
    groupId: a.group,
    courseId: a.course,
    status: a.status ?? 'active',
    page: a.page,
  })
  const { supabase } = await requireAdmin()
  const requested = query.page ?? 1
  let rows = await fetchPeople(supabase, query, requested)
  let page = requested
  if (Array.isArray(rows) && rows.length === 0 && requested > 1) {
    const snapped = await snapToLast(supabase, query)
    if (snapped === null || isEnded(snapped)) return snapped
    rows = snapped.rows
    page = snapped.page
  }
  if (rows === null || isEnded(rows)) return rows
  return {
    rows: rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name ?? '',
      email: r.email,
      deactivated: r.deactivated,
      groups: r.groups,
      courses: r.courses,
    })),
    total: totalOf(rows),
    page,
  }
}

/** Exams of the picked people (`userIds` omitted = every candidate), one row per exam with its live config. */
export async function getSubjectEligibility(
  sittingId: string,
  userIds?: readonly string[],
): Promise<SubjectEligibility[] | Ended | null> {
  const query = SubjectEligibilityQuerySchema.parse({
    sittingId,
    ...(userIds ? { userIds: [...userIds] } : {}),
  })
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_exam_sitting_subject_eligibility', {
    p_sitting_id: query.sittingId,
    ...(query.userIds ? { p_user_ids: query.userIds } : {}),
  })
  if (error) return readFailure('getSubjectEligibility', error.message, 'Failed to load exams')
  return (data ?? []).map((r) => ({
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    subjectShort: r.subject_short,
    courseId: r.course_id,
    courseName: r.course_name,
    people: r.people,
    eligible: r.eligible,
    enteredHere: r.entered_here,
    passed: r.passed,
    attemptRunning: r.attempt_running,
    enteredElsewhere: r.entered_elsewhere,
    notEnrolled: r.not_enrolled,
    deactivated: r.deactivated,
    state: r.state,
    attemptCount: r.attempt_count,
    passedAt: r.passed_at,
    passedScore: r.passed_score === null ? null : Number(r.passed_score),
    elsewhereSittingId: r.elsewhere_sitting_id,
    elsewhereAt: r.elsewhere_at,
  }))
}

/** What `issueSittingCodes` would do for the picked people (`userIds` omitted = the whole sitting). */
export async function getIssuePreview(
  sittingId: string,
  userIds?: readonly string[],
): Promise<IssuePreview | Ended | null> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_exam_sitting_issue_preview', {
    p_sitting_id: sittingId,
    ...(userIds ? { p_user_ids: [...userIds] } : {}),
  })
  if (error) return readFailure('getIssuePreview', error.message, 'Failed to load preview')
  const preview: IssuePreview = { counts: {}, studentsToIssue: 0, details: [] }
  for (const r of data ?? []) {
    if (r.row_kind === 'count' && r.reason) preview.counts[r.reason] = r.n
    else if (r.row_kind === 'students_to_issue') preview.studentsToIssue = r.n
    else if (r.row_kind === 'detail' && r.reason) {
      preview.details.push({
        entryId: r.entry_id,
        student: r.student_name,
        subjectShort: r.subject_short ?? '',
        reason: r.reason,
      })
    }
  }
  return preview
}

/** New people of a group; null when the sitting or the group does not exist. */
export async function getGroupAddCounts(
  sittingId: string,
  groupId: string,
): Promise<GroupAddCounts | Ended | null> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_exam_sitting_group_add_counts', {
    p_sitting_id: sittingId,
    p_group_id: groupId,
  })
  if (error) {
    if (error.message === 'group_not_found') return null
    return readFailure('getGroupAddCounts', error.message, 'Failed to load group')
  }
  const row = data?.[0]
  return { activeNew: row?.active_new ?? 0, deactivatedNew: row?.deactivated_new ?? 0 }
}

/** Picked people (omitted = every candidate) who also hold an entry in another sitting on the same UTC day. */
export async function getSameDayPeople(
  sittingId: string,
  userIds?: readonly string[],
): Promise<SameDayPerson[] | Ended | null> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_exam_sitting_same_day_people', {
    p_sitting_id: sittingId,
    ...(userIds ? { p_user_ids: [...userIds] } : {}),
  })
  if (error) return readFailure('getSameDayPeople', error.message, 'Failed to load people')
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    name: r.full_name,
    sittingId: r.sitting_id,
    scheduledAt: r.scheduled_at,
  }))
}

/** Live candidates of the sitting (all, or only `ids`); the organization predicate is explicit. */
export async function candidateIds(
  supabase: Supabase,
  organizationId: string,
  a: { sittingId: string; ids?: readonly string[] },
): Promise<string[]> {
  let query = supabase
    .from('exam_sitting_candidates')
    .select('user_id')
    .eq('sitting_id', a.sittingId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
  if (a.ids) query = query.in('user_id', [...a.ids])
  const { data, error } = await query
  if (error) {
    console.error('[candidateIds] DB error:', error.message)
    throw new Error('Failed to load candidates')
  }
  return (data ?? []).map((r) => r.user_id)
}

/** The popup's people: `all`, the valid candidate ids sent, the whole sitting (Issue only) or nobody. Never widens. */
export async function resolveSelection(
  sittingId: string,
  dlg: 'exams' | 'issue',
  sel: SelectionParams,
): Promise<Selection> {
  if (sel.all) return { kind: 'all' }
  if (sel.present) {
    if (sel.ids.length === 0) return { kind: 'empty' }
    const { supabase, organizationId } = await requireAdmin()
    const ids = await candidateIds(supabase, organizationId, { sittingId, ids: sel.ids })
    return ids.length > 0 ? { kind: 'ids', ids, truncated: sel.truncated } : { kind: 'empty' }
  }
  return dlg === 'issue' ? { kind: 'whole' } : { kind: 'empty' }
}
