import type { SupabaseClient } from '@supabase/supabase-js'
import { makeSittingE2eMaterials } from '../../helpers/exam-sitting-cleanup'
import type { getAdminClient } from '../../helpers/supabase'
import { E2E_REDTEAM_SIT_SUBJECT_PREFIX } from './seed-markers'

type Admin = ReturnType<typeof getAdminClient>

/** Creates a marked sitting through the admin RPC; returns its id. */
export async function createSittingRpc(
  adminClient: SupabaseClient,
  invigilatorId: string,
  scheduledAt: Date = new Date(),
): Promise<string> {
  const { data, error } = await adminClient.rpc('create_exam_sitting', {
    p_scheduled_at: scheduledAt.toISOString(),
    p_mode: 'remote',
    p_invigilator_id: invigilatorId,
    p_permitted_materials: makeSittingE2eMaterials(),
  })
  const row = Array.isArray(data) ? data[0] : null
  if (error || typeof row?.sitting_id !== 'string') {
    throw new Error(`create_exam_sitting: ${error?.message ?? 'no row'}`)
  }
  return row.sitting_id
}

/** Inserts a marked sitting row directly (service role); for day-ended fixtures the RPC refuses. */
export async function insertSittingRow(
  admin: Admin,
  opts: { orgId: string; adminId: string; scheduledAt: Date },
): Promise<string> {
  const { data, error } = await admin
    .from('exam_sittings')
    .insert({
      organization_id: opts.orgId,
      scheduled_at: opts.scheduledAt.toISOString(),
      mode: 'remote',
      invigilator_id: opts.adminId,
      created_by: opts.adminId,
      permitted_materials: makeSittingE2eMaterials(),
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') throw new Error(`exam_sittings: ${error?.message}`)
  return data.id
}

/** Inserts a live entry (service role); returns its id. */
export async function insertEntry(
  admin: Admin,
  opts: { orgId: string; sittingId: string; userId: string; subjectId: string },
): Promise<string> {
  const { data, error } = await admin
    .from('exam_sitting_entries')
    .insert({
      organization_id: opts.orgId,
      sitting_id: opts.sittingId,
      user_id: opts.userId,
      subject_id: opts.subjectId,
    })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string')
    throw new Error(`exam_sitting_entries: ${error?.message}`)
  return data.id
}

/** Inserts a marked throwaway subject; returns its id. */
export async function insertMarkedSubject(admin: Admin): Promise<string> {
  const code = `${E2E_REDTEAM_SIT_SUBJECT_PREFIX}${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const { data, error } = await admin
    .from('easa_subjects')
    .insert({ code, name: `${code} subject`, short: 'RTS', sort_order: 9001 })
    .select('id')
    .single()
  if (error || typeof data?.id !== 'string') throw new Error(`easa_subjects: ${error?.message}`)
  return data.id
}

export type SittingTrack = { sittingIds: string[]; subjectIds: string[]; adminId: string }

type Step = [label: string, run: () => PromiseLike<{ error: { message: string } | null }>]

/** Soft-deletes the tracked sittings' entries, candidates and unclosed sittings, then configs and
 *  subjects; per-step accumulator; resets the tracked ids. */
export async function cleanupSittingFixtures(admin: Admin, track: SittingTrack): Promise<void> {
  const errors: string[] = []
  const now = new Date().toISOString()
  const sids = [...track.sittingIds]
  const subs = [...track.subjectIds]
  track.sittingIds.length = 0
  track.subjectIds.length = 0
  const by = track.adminId
  const steps: Step[] = []
  if (sids.length > 0) {
    steps.push(
      [
        'entries',
        () =>
          admin
            .from('exam_sitting_entries')
            .update({ deleted_at: now, deleted_by: by })
            .in('sitting_id', sids)
            .is('deleted_at', null),
      ],
      [
        'candidates',
        () =>
          admin
            .from('exam_sitting_candidates')
            .update({ deleted_at: now, deleted_by: by })
            .in('sitting_id', sids)
            .is('deleted_at', null),
      ],
      [
        'sittings',
        () =>
          admin
            .from('exam_sittings')
            .update({ deleted_at: now, deleted_by: by })
            .in('id', sids)
            .is('deleted_at', null)
            .is('closed_at', null),
      ],
    )
  }
  if (subs.length > 0) {
    steps.push(
      [
        'exam_configs',
        () =>
          admin
            .from('exam_configs')
            .update({ deleted_at: now })
            .in('subject_id', subs)
            .is('deleted_at', null),
      ],
      [
        'easa_subjects',
        () =>
          admin
            .from('easa_subjects')
            .update({ deleted_at: now })
            .in('id', subs)
            .is('deleted_at', null),
      ],
    )
  }
  for (const [label, run] of steps) {
    try {
      const { error } = await run()
      if (error) throw new Error(`${label}: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  if (errors.length > 0) throw new Error(`cleanupSittingFixtures: ${errors.join('; ')}`)
}
