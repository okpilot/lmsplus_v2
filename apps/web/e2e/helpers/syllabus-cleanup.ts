import { getAdminClient } from './supabase'

/** Marker prefix on `easa_subjects.code` for rows created by syllabus E2E specs (code is max 10 chars). */
export const SYLLABUS_E2E_CODE_PREFIX = 'E2E-'

/** Unique marked subject code, <= 10 chars. */
export function makeSyllabusE2eCode(): string {
  return `${SYLLABUS_E2E_CODE_PREFIX}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

/** Soft-deletes still-active marked subjects (service role). Zero rows is fine. Returns the count. */
export async function softDeleteMarkedSyllabusSubjects(): Promise<number> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('easa_subjects')
    .update({ deleted_at: new Date().toISOString() })
    .like('code', `${SYLLABUS_E2E_CODE_PREFIX}%`)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`softDeleteMarkedSyllabusSubjects: ${error.message}`)
  const count = data?.length ?? 0
  if (count > 0) console.log(`softDeleteMarkedSyllabusSubjects: soft-deleted ${count} subject(s)`)
  return count
}

/** Reads a marked subject's `deleted_at` by code (service role). `undefined` when no row exists. */
export async function getSubjectDeletedAt(code: string): Promise<string | null | undefined> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('easa_subjects')
    .select('deleted_at')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`getSubjectDeletedAt: ${error.message}`)
  return data ? data.deleted_at : undefined
}
