import { requireAdmin } from '@/lib/auth/require-admin'
import {
  ENTRY_STATUSES,
  type EntryStatus,
  type RemovedEntryRow,
  ROSTER_PAGE_SIZE,
  type RosterEntry,
  type RosterRow,
  type ShowValue,
} from './types'

type Supabase = Awaited<ReturnType<typeof requireAdmin>>['supabase']

const STATUSES: ReadonlySet<string> = new Set<string>(ENTRY_STATUSES)

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null)

/** One jsonb entry of the roster RPC as a `RosterEntry`, or null when malformed. */
function parseEntry(raw: unknown): RosterEntry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const status = str(r.status)
  const entryId = str(r.entry_id)
  const subjectId = str(r.subject_id)
  if (!entryId || !subjectId || !status || !STATUSES.has(status)) return null
  return {
    entryId,
    subjectId,
    subjectShort: str(r.subject_short) ?? '',
    subjectName: str(r.subject_name) ?? '',
    courseId: str(r.course_id),
    courseName: str(r.course_name),
    status: status as EntryStatus,
    attemptNumber: numOrNull(r.attempt_number),
    passed: typeof r.passed === 'boolean' ? r.passed : null,
    score: numOrNull(r.score),
    codeId: str(r.code_id),
    code: str(r.code),
    codeExpiresAt: str(r.code_expires_at),
    codeEmailedAt: str(r.code_emailed_at),
    voidReason: str(r.void_reason),
    sessionId: str(r.session_id),
    sessionStartedAt: str(r.session_started_at),
  }
}

function parseEntries(raw: unknown): RosterEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseEntry).filter((e): e is RosterEntry => e !== null)
}

type RosterRpcRow = {
  user_id: string
  full_name: string | null
  email: string
  deactivated: boolean
  has_attempt: boolean
  entries: unknown
  total_count: number | string
}

function mapRow(r: RosterRpcRow): RosterRow {
  return {
    userId: r.user_id,
    name: r.full_name ?? '',
    email: r.email,
    deactivated: r.deactivated,
    hasAttempt: r.has_attempt,
    entries: parseEntries(r.entries),
  }
}

type Query = { sittingId: string; q?: string; show?: ShowValue; limit: number; page: number }

/** A page of the roster; null when the sitting is not found. */
async function fetchRoster(supabase: Supabase, a: Query): Promise<RosterRpcRow[] | null> {
  const { data, error } = await supabase.rpc('list_exam_sitting_roster', {
    p_sitting_id: a.sittingId,
    ...(a.q ? { p_q: a.q } : {}),
    p_limit: a.limit,
    p_offset: (a.page - 1) * a.limit,
    p_show: a.show === 'attempts' ? 'has_attempts' : (a.show ?? 'all'),
  })
  if (error) {
    if (error.message === 'sitting_not_found') return null
    console.error('[getRoster] RPC error:', error.message)
    throw new Error('Failed to load roster')
  }
  return data ?? []
}

type RosterPage = { rows: RosterRow[]; total: number }

const totalOf = (rows: RosterRpcRow[]) => Number(rows[0]?.total_count ?? 0)

/** The filtered roster, 50 per page, sorted by name; a page past the end snaps to the last page. */
export async function getRoster(a: {
  sittingId: string
  q?: string
  show?: ShowValue
  page: number
}): Promise<RosterPage | null> {
  const { supabase } = await requireAdmin()
  const base = { sittingId: a.sittingId, q: a.q, show: a.show, limit: ROSTER_PAGE_SIZE }
  let rows = await fetchRoster(supabase, { ...base, page: a.page })
  if (rows === null) return null
  let total = totalOf(rows)
  if (rows.length === 0 && a.page > 1) {
    const first = await fetchRoster(supabase, { ...base, page: 1 })
    if (first === null) return null
    total = totalOf(first)
    if (total === 0) return { rows: [], total: 0 }
    const last = Math.max(1, Math.ceil(total / ROSTER_PAGE_SIZE))
    if (last === 1) rows = first
    else {
      const snapped = await fetchRoster(supabase, { ...base, page: last })
      if (snapped === null) return null
      rows = snapped
    }
  }
  return { rows: rows.map(mapRow), total }
}

const ALL_PAGE_SIZE = 100

/** Every person of the sitting (Print page): pages of 100 until the total is covered. */
export async function getRosterAll(sittingId: string): Promise<RosterRow[]> {
  const { supabase } = await requireAdmin()
  const out: RosterRow[] = []
  for (let page = 1; ; page++) {
    const rows = await fetchRoster(supabase, { sittingId, limit: ALL_PAGE_SIZE, page })
    if (!rows || rows.length === 0) break
    out.push(...rows.map(mapRow))
    if (out.length >= totalOf(rows)) break
  }
  return out
}

/** Auto-removed (passed) entries, newest first as the RPC orders them; null when the sitting is not found. */
export async function getRemoved(
  sittingId: string,
): Promise<{ rows: RemovedEntryRow[]; total: number } | null> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('list_exam_sitting_removed_entries', {
    p_sitting_id: sittingId,
  })
  if (error) {
    if (error.message === 'sitting_not_found') return null
    console.error('[getRemoved] RPC error:', error.message)
    throw new Error('Failed to load removed entries')
  }
  const rows = data ?? []
  return {
    rows: rows.map((r) => ({
      entryId: r.entry_id,
      userId: r.user_id,
      studentName: r.student_name,
      // Generated type says string; the LEFT JOIN returns NULL for a soft-deleted subject.
      subjectShort: r.subject_short ?? '',
      passedAt: r.passed_at,
      removedAt: r.removed_at,
      noticeSent: r.notice_sent,
    })),
    total: Number(rows[0]?.total_count ?? 0),
  }
}
