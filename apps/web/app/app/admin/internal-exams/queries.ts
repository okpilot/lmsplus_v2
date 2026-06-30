import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { type CodeRowRaw, mapCodeRow } from './_row-mappers'
import { PAGE_SIZE } from './pagination'
import type { ExamSubjectOption, InternalExamCodeRow, ListCodesFilters } from './types'

type ChainBuilder = {
  select: {
    (cols: string): ChainBuilder
    (cols: string, opts: { count: 'exact'; head: boolean }): ChainBuilder
  }
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: null) => ChainBuilder
  not: (col: string, op: string, val: unknown) => ChainBuilder
  lte: (col: string, val: unknown) => ChainBuilder
  gt: (col: string, val: unknown) => ChainBuilder
  order: (col: string, opts: { ascending: boolean }) => ChainBuilder
  range: (from: number, to: number) => ChainBuilder
}

type AnyClient = {
  from: (t: string) => ChainBuilder
}

const CODE_COLS_BASE = `id, code, subject_id, student_id, issued_by, issued_at, expires_at,
       consumed_at, consumed_session_id, voided_at, voided_by, void_reason, emailed_at,
       easa_subjects(name),
       users!student_id(full_name, email)`

/**
 * Applies org scope, soft-delete filter, and status/student/subject predicates to a codes query builder.
 * `nowIso` is passed in (not computed here) so the count and data queries share the same instant.
 */
function applyCodeFilters(
  builder: ChainBuilder,
  organizationId: string,
  filters: ListCodesFilters,
  nowIso: string,
): ChainBuilder {
  let b = builder.eq('organization_id', organizationId).is('deleted_at', null)
  if (filters.studentId) b = b.eq('student_id', filters.studentId)
  if (filters.subjectId) b = b.eq('subject_id', filters.subjectId)
  switch (filters.status) {
    case 'voided':
      return b.not('voided_at', 'is', null)
    case 'expired':
      return b.is('voided_at', null).is('consumed_at', null).lte('expires_at', nowIso)
    case 'consumed':
      // linked session still in flight (ended_at IS NULL)
      return b
        .not('consumed_at', 'is', null)
        .is('voided_at', null)
        .is('quiz_sessions.ended_at', null)
    case 'finished':
      // linked session has ended (ended_at IS NOT NULL)
      return b
        .not('consumed_at', 'is', null)
        .is('voided_at', null)
        .not('quiz_sessions.ended_at', 'is', null)
    case 'active':
      return b.is('consumed_at', null).is('voided_at', null).gt('expires_at', nowIso)
    default:
      return b
  }
}

export async function listInternalExamCodes(
  filters: ListCodesFilters = {},
): Promise<{ rows: InternalExamCodeRow[]; totalCount: number }> {
  const { organizationId } = await requireAdmin()
  const page = filters.page ?? 1
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  // adminClient: cross-row `users` reads are unreliable under tenant_isolation RLS (see
  // attempts-queries.ts); PostgREST also applies RLS to embedded resources.
  const client = adminClient as unknown as AnyClient
  const nowIso = new Date().toISOString()
  // 'consumed'/'finished' filter the embedded session's ended_at → both selects need an INNER
  // join (a count select filtering quiz_sessions.ended_at without !inner 400s — PostgREST PGRST108).
  const splitOnSession = filters.status === 'consumed' || filters.status === 'finished'
  const embed = splitOnSession
    ? 'quiz_sessions!consumed_session_id!inner(ended_at)'
    : 'quiz_sessions!consumed_session_id(ended_at)'

  const countBuilder = applyCodeFilters(
    client
      .from('internal_exam_codes')
      .select(splitOnSession ? `id, ${embed}` : 'id', { count: 'exact', head: true }),
    organizationId,
    filters,
    nowIso,
  )
  const { count, error: countError } = (await (countBuilder as unknown as PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>)) ?? { count: null, error: null }
  if (countError) {
    console.error('[listInternalExamCodes] count error:', countError.message)
    throw new Error('Failed to load internal exam codes')
  }
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  if (totalCount === 0 || page > totalPages) {
    return { rows: [], totalCount }
  }

  const dataBuilder = applyCodeFilters(
    client.from('internal_exam_codes').select(`${CODE_COLS_BASE},\n       ${embed}`),
    organizationId,
    filters,
    nowIso,
  )
    .order('issued_at', { ascending: false })
    .order('id', { ascending: false }) // id tiebreaker keeps pages stable (issued_at not unique)
    .range(from, to)

  const { data, error } = (await (dataBuilder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) {
    console.error('[listInternalExamCodes] DB error:', error.message)
    throw new Error('Failed to load internal exam codes')
  }
  const raw = Array.isArray(data) ? (data as CodeRowRaw[]) : []
  const rows: InternalExamCodeRow[] = raw.map(mapCodeRow)
  return { rows, totalCount }
}

type SubjectRowRaw = { id: string; code: string; name: string }

export async function listExamSubjects(): Promise<ExamSubjectOption[]> {
  const { supabase, organizationId } = await requireAdmin()
  const { data, error } = await supabase
    .from('exam_configs')
    .select('subject_id, easa_subjects!subject_id(id, code, name)')
    .eq('organization_id', organizationId)
    .eq('enabled', true)
    .is('deleted_at', null)
  if (error) {
    console.error('[listExamSubjects] DB error:', error.message)
    throw new Error('Failed to load subjects')
  }
  type Joined = { easa_subjects: SubjectRowRaw | null }
  const rows = (data ?? []) as Joined[]
  return rows
    .map((r) => r.easa_subjects)
    .filter((s): s is SubjectRowRaw => s !== null)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((s) => ({ id: s.id, code: s.code, name: s.name }))
}
