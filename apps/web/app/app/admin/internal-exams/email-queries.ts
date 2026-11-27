import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export type InternalExamCodeForEmail = {
  code: string
  studentEmail: string
  studentName: string | null
  subjectName: string
  expiresAt: string
  consumedAt: string | null
  voidedAt: string | null
  sittingEntryId: string | null
  /** Null for a legacy code. */
  sittingId: string | null
  scheduledAt: string | null
  mode: 'remote' | 'in_person' | null
  sittingStatus: string | null
}

type SittingEmbed = { scheduled_at: string; mode: 'remote' | 'in_person'; status: string }

type CodeRowRaw = {
  code: string
  expires_at: string
  consumed_at: string | null
  voided_at: string | null
  sitting_entry_id: string | null
  exam_sitting_entries?: { sitting_id: string; exam_sittings: SittingEmbed | null } | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null; deleted_at: string | null } | null
}

type ChainBuilder = {
  select: (cols: string) => ChainBuilder
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: null) => ChainBuilder
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

type AnyClient = { from: (t: string) => ChainBuilder }

function isCodeRow(value: unknown): value is CodeRowRaw {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.code === 'string' &&
    typeof v.expires_at === 'string' &&
    (v.consumed_at === null || typeof v.consumed_at === 'string') &&
    (v.voided_at === null || typeof v.voided_at === 'string') &&
    (v.sitting_entry_id === null || typeof v.sitting_entry_id === 'string')
  )
}

/**
 * Fetches the single internal exam code's email payload, scoped to the admin's
 * organization. Uses adminClient (service role) because cross-row reads on
 * `users` are impossible under its live policy `users_select` (`id = auth.uid()`),
 * which returns only the caller's own row — `users` carries no `tenant_isolation`
 * policy (dropped, migs 20260311000004/20260312000012). Mirrors queries.ts.
 * Returns null on error, no row, a row missing a recipient email, or a
 * soft-deleted (deactivated) student — never email a deactivated student.
 */
export async function getInternalExamCodeForEmail(
  codeId: string,
): Promise<InternalExamCodeForEmail | null> {
  const { organizationId } = await requireAdmin()
  const client = adminClient as unknown as AnyClient

  const { data, error } = await client
    .from('internal_exam_codes')
    .select(
      `code, expires_at, consumed_at, voided_at, sitting_entry_id,
       exam_sitting_entries!internal_exam_codes_sitting_entry_fkey(sitting_id, exam_sittings!exam_sitting_entries_sitting_id_organization_id_fkey(scheduled_at, mode, status)),
       easa_subjects!subject_id(name),
       users!student_id(full_name, email, deleted_at)`,
    )
    .eq('id', codeId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[getInternalExamCodeForEmail] DB error:', error.message)
    return null
  }
  if (!isCodeRow(data)) return null

  // Never email a soft-deleted (deactivated) student, even though the code row
  // itself is still active. adminClient bypasses RLS, so this filter is manual.
  if (data.users?.deleted_at != null) return null

  // Guard the recipient at the use site: it must be a non-empty string before
  // it becomes the email `to`, even if the joined shape drifts.
  const studentEmail = data.users?.email
  if (typeof studentEmail !== 'string' || studentEmail.length === 0) return null

  const entry = data.exam_sitting_entries
  const sitting = entry?.exam_sittings ?? null
  return {
    code: data.code,
    studentEmail,
    studentName: data.users?.full_name ?? null,
    subjectName: data.easa_subjects?.name ?? '',
    expiresAt: data.expires_at,
    consumedAt: data.consumed_at,
    voidedAt: data.voided_at,
    sittingEntryId: data.sitting_entry_id,
    sittingId: entry?.sitting_id ?? null,
    scheduledAt: sitting?.scheduled_at ?? null,
    mode: sitting?.mode ?? null,
    sittingStatus: sitting?.status ?? null,
  }
}

type Rows = PromiseLike<{ data: unknown; error: { message: string } | null }>
type Q = Rows & {
  select: (cols: string) => Q
  eq: (col: string, val: unknown) => Q
  is: (col: string, val: null) => Q
  gt: (col: string, val: string) => Q
  order: (col: string) => Q
  limit: (n: number) => Q
  maybeSingle: () => Rows
}

export type SittingEmailRow = {
  codeId: string
  code: string
  studentName: string | null
  email: string
  subjectName: string
  scheduledAt: string
  mode: 'remote' | 'in_person'
}

export type SittingCodesForEmail = {
  sitting: { status: string; scheduledAt: string } | null
  rows: SittingEmailRow[]
  skipped: number
}

type SittingCodeRaw = {
  id: string
  code: string
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null; deleted_at: string | null } | null
}

const PAGE = 1000

/** Reads every page by id keyset (PostgREST caps a response at max_rows). Throws on a DB error. */
async function readAll<T extends { id: string }>(
  page: (lastId: string | null) => Rows,
): Promise<T[]> {
  const out: T[] = []
  let lastId: string | null = null
  for (;;) {
    const { data, error } = await page(lastId)
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('null page')
    const rows = data as T[]
    out.push(...rows)
    const last = rows.at(-1)
    if (!last) return out
    lastId = last.id
  }
}

type Db = { from: (t: string) => Q }

function unemailedCodes(db: Db, orgId: string, sittingId: string) {
  return readAll<SittingCodeRaw>((lastId) => {
    const q = db
      .from('internal_exam_codes')
      .select(
        `id, code,
         exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id),
         easa_subjects!subject_id(name),
         users!student_id(full_name, email, deleted_at)`,
      )
      .eq('organization_id', orgId)
      .eq('exam_sitting_entries.sitting_id', sittingId)
      .is('exam_sitting_entries.deleted_at', null)
      .is('deleted_at', null)
      .is('emailed_at', null)
      .is('consumed_at', null)
      .is('voided_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('id')
    return (lastId === null ? q : q.gt('id', lastId)).limit(PAGE)
  })
}

/**
 * Unused, unemailed codes of a sitting, for the bulk email. Scoped to `orgId` on
 * every read (adminClient bypasses RLS; `users` is unreadable across rows). A deactivated or
 * email-less student is counted in `skipped`. `sitting` is null when the sitting is not in `orgId`.
 * Throws on a DB error (a silent empty result would read as "nothing to send").
 */
export async function getSittingCodesForEmail(
  orgId: string,
  sittingId: string,
): Promise<SittingCodesForEmail> {
  const db = adminClient as unknown as Db
  const empty = { sitting: null, rows: [], skipped: 0 }
  const s = await db
    .from('exam_sittings')
    .select('status, scheduled_at, mode')
    .eq('id', sittingId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  const sr = s.data as { status: string; scheduled_at: string; mode: SittingEmbed['mode'] } | null
  if (s.error) throw new Error(s.error.message)
  if (!sr) return empty
  const sitting = { status: sr.status, scheduledAt: sr.scheduled_at }
  const codes = await unemailedCodes(db, orgId, sittingId)
  const rows: SittingEmailRow[] = []
  let skipped = 0
  for (const c of codes) {
    const email = c.users?.email
    if (c.users?.deleted_at != null || typeof email !== 'string' || email.length === 0) {
      skipped++
      continue
    }
    rows.push({
      codeId: c.id,
      code: c.code,
      studentName: c.users?.full_name ?? null,
      email,
      subjectName: c.easa_subjects?.name ?? '',
      scheduledAt: sr.scheduled_at,
      mode: sr.mode,
    })
  }
  return { sitting, rows, skipped }
}
