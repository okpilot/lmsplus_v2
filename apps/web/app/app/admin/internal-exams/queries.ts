import { requireAdmin } from '@/lib/auth/require-admin'
import {
  type OffsetChainBuilder,
  offsetAdminClient,
  runOffsetCount,
  runOffsetRows,
} from './_offset-query'
import { type CodeRowRaw, mapCodeRow } from './_row-mappers'
import { clampPage, PAGE_SIZE } from './pagination'
import type { ExamSubjectOption, InternalExamCodeRow, ListCodesFilters } from './types'

const CODE_COLS_BASE = `id, code, subject_id, student_id, issued_by, issued_at, expires_at,
       consumed_at, consumed_session_id, voided_at, voided_by, void_reason, emailed_at,
       easa_subjects!subject_id(name),
       users!student_id(full_name, email)`

/**
 * Applies org scope, soft-delete filter, and status/student/subject predicates to a codes query builder.
 * `nowIso` is passed in (not computed here) so the count and data queries share the same instant.
 */
function applyCodeFilters(
  builder: OffsetChainBuilder,
  organizationId: string,
  filters: ListCodesFilters,
  nowIso: string,
): OffsetChainBuilder {
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
  const page = clampPage(filters.page)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const client = offsetAdminClient
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
  const ctx = {
    tag: 'listInternalExamCodes',
    failMessage: 'Failed to load internal exam codes',
  }
  const totalCount = await runOffsetCount(countBuilder, ctx)
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

  const raw = await runOffsetRows<CodeRowRaw>(dataBuilder, ctx)
  // Derive status against the same instant the active/expired SQL filters used (nowIso).
  const nowMs = new Date(nowIso).getTime()
  const rows: InternalExamCodeRow[] = raw.map((r) => mapCodeRow(r, nowMs))
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
