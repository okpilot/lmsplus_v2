import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { escapeLike } from '@/lib/utils/escape-like'
import { isPastEndPage } from '@/lib/utils/past-end-page'
import { quoteOrValue } from '@/lib/utils/quote-or-value'
import type {
  CourseOption,
  GroupOption,
  StudentFilters,
  StudentRow,
  StudentsPageResult,
} from './types'

export const PAGE_SIZE = 25

const USER_COLUMNS =
  'id, email, full_name, role, organization_id, last_active_at, created_at, deleted_at, login_instructions_sent_at, temp_password_expires_at'
const COURSE_EMBED = 'course_enrolments!course_enrolments_user_id_fkey(course_id)'
// Badges embed: every active membership of the row.
const GROUP_EMBED = 'student_group_members!student_group_members_user_id_fkey(group_id)'
// Filter embed: separate alias so the badges keep all groups of a matching row.
const GROUP_FILTER_EMBED =
  'filter_members:student_group_members!student_group_members_user_id_fkey!inner(group_id)'

type PageQueryInput = { filters: StudentFilters; organizationId: string }

function selectOf(filters: StudentFilters, columns: string): string {
  return filters.group ? `${columns}, ${GROUP_FILTER_EMBED}` : columns
}

function applyFilters<B extends FilterableQuery<B>>(builder: B, filters: StudentFilters): B {
  let q = builder
  if (filters.status === 'active') q = q.is('deleted_at', null)
  if (filters.status === 'inactive') q = q.not('deleted_at', 'is', null)
  if (filters.role) q = q.eq('role', filters.role)
  if (filters.group) {
    q = q.eq('filter_members.group_id', filters.group).is('filter_members.deleted_at', null)
  }
  if (filters.search) {
    const pattern = quoteOrValue(`%${escapeLike(filters.search)}%`)
    q = q.or(`email.ilike.${pattern},full_name.ilike.${pattern}`)
  }
  return q
}

// Method syntax keeps parameters bivariant so the typed PostgREST builder satisfies it.
type FilterableQuery<B> = {
  eq(col: string, val: unknown): B
  is(col: string, val: null): B
  not(col: string, op: string, val: null): B
  or(filter: string): B
}

function fetchPage({ filters, organizationId }: PageQueryInput) {
  const from = (Math.max(1, filters.page ?? 1) - 1) * PAGE_SIZE
  return applyFilters(
    adminClient
      .from('users')
      .select(selectOf(filters, `${USER_COLUMNS}, ${COURSE_EMBED}, ${GROUP_EMBED}`), {
        count: 'exact',
      })
      .is('course_enrolments.deleted_at', null)
      .is('student_group_members.deleted_at', null)
      .eq('organization_id', organizationId),
    filters,
  )
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
}

async function countAll({ filters, organizationId }: PageQueryInput): Promise<number> {
  const { count, error } = await applyFilters(
    adminClient
      .from('users')
      .select(selectOf(filters, 'id'), { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    filters,
  )
  if (error) {
    console.error('[getStudentsPage] count error:', error.message)
    throw new Error('Failed to fetch students')
  }
  return count ?? 0
}

type RawRow = Omit<StudentRow, 'course_ids' | 'group_ids'> & {
  course_enrolments: Array<{ course_id: string }>
  student_group_members: Array<{ group_id: string }>
  filter_members?: unknown
}

function isRawRowArray(data: unknown): data is RawRow[] {
  return (
    Array.isArray(data) &&
    data.every(
      (r) =>
        typeof r === 'object' &&
        r !== null &&
        Array.isArray((r as RawRow).course_enrolments) &&
        Array.isArray((r as RawRow).student_group_members),
    )
  )
}

function toStudentRow(raw: RawRow): StudentRow {
  const { course_enrolments, student_group_members, filter_members: _filter, ...rest } = raw
  return {
    ...rest,
    course_ids: course_enrolments.map((e) => e.course_id),
    group_ids: student_group_members.map((m) => m.group_id),
  }
}

export async function getStudentsPage(filters: StudentFilters): Promise<StudentsPageResult> {
  const { organizationId } = await requireAdmin()
  const input = { filters, organizationId }

  const result = await fetchPage(input)
  if (isPastEndPage(result)) {
    // Past the end: the caller redirects to the last page from the exact total.
    return { rows: [], totalCount: await countAll(input) }
  }
  if (result.error) {
    console.error('[getStudentsPage] DB error:', result.error.message)
    throw new Error('Failed to fetch students')
  }

  const data = result.data ?? []
  if (!isRawRowArray(data)) {
    console.error('[getStudentsPage] malformed rows')
    throw new Error('Failed to fetch students')
  }
  const rows = data.map(toStudentRow)
  return { rows, totalCount: result.count ?? 0 }
}

export async function getGroupOptions(): Promise<GroupOption[]> {
  const { organizationId } = await requireAdmin()

  const { data, error } = await adminClient
    .from('student_groups')
    .select('id, name')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name')

  if (error) {
    console.error('[getGroupOptions] DB error:', error.message)
    throw new Error('Failed to fetch groups')
  }

  return data ?? []
}

export async function getCourses(): Promise<CourseOption[]> {
  await requireAdmin()

  const { data, error } = await adminClient
    .from('courses')
    .select('id, short, name')
    .order('sort_order')

  if (error) {
    console.error('[getCourses] DB error:', error.message)
    throw new Error('Failed to fetch courses')
  }

  return data ?? []
}
