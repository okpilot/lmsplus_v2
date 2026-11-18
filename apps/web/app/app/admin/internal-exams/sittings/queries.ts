import { cache } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { readInvigilator } from './invigilator-lookup'
import { readInvigilatorOptions } from './invigilator-reads'
import {
  type InvigilatorOption,
  SITTINGS_PAGE_SIZE,
  type SittingRow,
  type SittingScope,
  type SittingStatus,
  type SittingSummary,
} from './types'

function toStatus(v: string | null): SittingStatus {
  return v === 'open' || v === 'closed' || v === 'cancelled' ? v : 'scheduled'
}

export async function listSittings(
  scope: SittingScope,
  page = 1,
): Promise<{ rows: SittingRow[]; totalCount: number }> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('list_exam_sittings', {
    p_scope: scope,
    p_limit: SITTINGS_PAGE_SIZE,
    p_offset: (page - 1) * SITTINGS_PAGE_SIZE,
  })
  if (error) {
    console.error('[listSittings] RPC error:', error.message)
    throw new Error('Failed to load sittings')
  }
  const rows = (data ?? []).map(
    (r): SittingRow => ({
      id: r.id,
      scheduledAt: r.scheduled_at,
      mode: r.mode === 'in_person' ? 'in_person' : 'remote',
      status: toStatus(r.status),
      invigilatorId: r.invigilator_id,
      invigilatorName: r.invigilator_name,
      invigilatorActive: r.invigilator_active,
      permittedMaterials: r.permitted_materials,
      startedAt: r.started_at,
      closedAt: r.closed_at,
      candidates: r.candidates,
      entries: r.entries,
      entriesWithoutCode: r.entries_without_code,
      entriesFinished: r.entries_finished,
      entriesAbsent: r.entries_absent,
      endedAutomatically: r.ended_automatically,
    }),
  )
  return { rows, totalCount: Number(data?.[0]?.total_count ?? 0) }
}

/** One RPC per request: lazy-closes expired sittings and returns the summary counts. */
export const getSummary = cache(async (sittingId: string): Promise<SittingSummary | null> => {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.rpc('get_exam_sitting_summary', {
    p_sitting_id: sittingId,
  })
  if (error) {
    if (error.message === 'sitting_not_found') return null
    console.error('[getSummary] RPC error:', error.message)
    throw new Error('Failed to load sitting')
  }
  const r = data?.[0]
  if (!r) return null
  return {
    status: toStatus(r.status),
    scheduledAt: r.scheduled_at,
    candidates: r.candidates,
    entries: r.entries,
    codesIssued: r.codes_issued,
    dayEnded: r.day_ended,
    attemptsRunning: r.attempts_running,
    entriesNotStarted: r.entries_not_started,
    studentsNotStarted: r.students_not_started,
    entriesIssuable: r.entries_issuable,
  }
})

/** Sitting row by id and org (cancelled included). Counts come from getSummary. */
export const getSitting = cache(async (id: string): Promise<SittingRow | null> => {
  const { supabase, organizationId } = await requireAdmin()
  const { data, error } = await supabase
    .from('exam_sittings')
    .select(
      'id, scheduled_at, mode, status, invigilator_id, permitted_materials, started_at, closed_at, ended_automatically',
    )
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[getSitting] DB error:', error.message)
    throw new Error('Failed to load sitting')
  }
  if (!data) return null
  const inv = await readInvigilator(organizationId, data.invigilator_id)
  return {
    id: data.id,
    scheduledAt: data.scheduled_at,
    mode: data.mode === 'in_person' ? 'in_person' : 'remote',
    status: toStatus(data.status),
    invigilatorId: data.invigilator_id,
    invigilatorName: inv?.name ?? 'Unknown',
    invigilatorActive: inv?.active ?? false,
    permittedMaterials: data.permitted_materials,
    startedAt: data.started_at,
    closedAt: data.closed_at,
    candidates: 0,
    entries: 0,
    entriesWithoutCode: 0,
    entriesFinished: 0,
    entriesAbsent: 0,
    endedAutomatically: data.ended_automatically,
  }
})

/** Active admins and instructors of the caller's organization. Names need the service role (users RLS is self-only). */
export async function listInvigilatorOptions(): Promise<InvigilatorOption[]> {
  const { organizationId } = await requireAdmin()
  return readInvigilatorOptions(organizationId)
}
