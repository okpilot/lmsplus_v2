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
}

type CodeRowRaw = {
  code: string
  expires_at: string
  consumed_at: string | null
  voided_at: string | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null } | null
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
    (v.voided_at === null || typeof v.voided_at === 'string')
  )
}

/**
 * Fetches the single internal exam code's email payload, scoped to the admin's
 * organization. Uses adminClient (service role) because cross-row reads on
 * `users` are unreliable under tenant_isolation RLS, mirroring queries.ts.
 * Returns null on error, no row, or a row missing a recipient email.
 */
export async function getInternalExamCodeForEmail(
  codeId: string,
): Promise<InternalExamCodeForEmail | null> {
  const { organizationId } = await requireAdmin()
  const client = adminClient as unknown as AnyClient

  const { data, error } = await client
    .from('internal_exam_codes')
    .select(
      `code, expires_at, consumed_at, voided_at,
       easa_subjects!subject_id(name),
       users!student_id(full_name, email)`,
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

  const studentEmail = data.users?.email ?? ''
  if (studentEmail.length === 0) return null

  return {
    code: data.code,
    studentEmail,
    studentName: data.users?.full_name ?? null,
    subjectName: data.easa_subjects?.name ?? '',
    expiresAt: data.expires_at,
    consumedAt: data.consumed_at,
    voidedAt: data.voided_at,
  }
}
