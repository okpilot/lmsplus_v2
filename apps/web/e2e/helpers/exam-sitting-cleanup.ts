import { randomUUID } from 'node:crypto'
import { getAdminClient } from './supabase'

/** Marker prefix on `exam_sittings.permitted_materials` for rows created by sitting E2E specs. */
export const EXAM_SITTING_E2E_PREFIX = 'E2E-SIT-'

const MATERIALS_LIKE = `${EXAM_SITTING_E2E_PREFIX}%`

/** Unique marked `permitted_materials` value (<= 1000 chars). */
export function makeSittingE2eMaterials(): string {
  return `${EXAM_SITTING_E2E_PREFIX}${randomUUID()}`
}

function logDeleted(table: string, count: number): void {
  if (count > 0) console.log(`cleanupE2eExamSittings: soft-deleted ${count} ${table} row(s)`)
}

/** Void unused codes, then soft-delete entries, candidates and sittings of marked sittings. */
export async function cleanupE2eExamSittings(): Promise<void> {
  const admin = getAdminClient()
  const now = new Date().toISOString()
  const { data: sittings, error: findErr } = await admin
    .from('exam_sittings')
    .select('id, created_by')
    .like('permitted_materials', MATERIALS_LIKE)
    .is('deleted_at', null)
  if (findErr) throw new Error(`cleanupE2eExamSittings: ${findErr.message}`)
  const rows = sittings ?? []
  if (rows.length === 0) return
  const ids = rows.map((s) => s.id)
  const createdBy = rows[0]?.created_by

  const { data: entries, error: entryLookupErr } = await admin
    .from('exam_sitting_entries')
    .select('id')
    .in('sitting_id', ids)
    .is('deleted_at', null)
  if (entryLookupErr) throw new Error(`cleanupE2eExamSittings entries: ${entryLookupErr.message}`)
  const entryIds = (entries ?? []).map((e) => e.id)

  if (entryIds.length > 0) {
    const { error: codeErr } = await admin
      .from('internal_exam_codes')
      .update({ voided_at: now, voided_by: createdBy, void_reason: 'e2e_cleanup' })
      .in('sitting_entry_id', entryIds)
      .is('consumed_at', null)
      .is('voided_at', null)
    if (codeErr) throw new Error(`cleanupE2eExamSittings codes: ${codeErr.message}`)
  }

  const { data: ent, error: entErr } = await admin
    .from('exam_sitting_entries')
    .update({ deleted_at: now })
    .in('sitting_id', ids)
    .is('deleted_at', null)
    .select('id')
  if (entErr) throw new Error(`cleanupE2eExamSittings entries: ${entErr.message}`)
  logDeleted('exam_sitting_entries', ent?.length ?? 0)

  const { data: cand, error: candErr } = await admin
    .from('exam_sitting_candidates')
    .update({ deleted_at: now })
    .in('sitting_id', ids)
    .is('deleted_at', null)
    .select('id')
  if (candErr) throw new Error(`cleanupE2eExamSittings candidates: ${candErr.message}`)
  logDeleted('exam_sitting_candidates', cand?.length ?? 0)

  for (const s of rows) {
    const { error } = await admin
      .from('exam_sittings')
      .update({ deleted_at: now, deleted_by: s.created_by })
      .eq('id', s.id)
    if (error) throw new Error(`cleanupE2eExamSittings sittings: ${error.message}`)
  }
  logDeleted('exam_sittings', rows.length)
}
