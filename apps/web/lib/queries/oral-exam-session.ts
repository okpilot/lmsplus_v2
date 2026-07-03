import { createServerSupabaseClient } from '@repo/db/server'

export type OralSessionSummary = {
  id: string
  status: string
  mode: string
  sections: { sectionNo: number; type: string }[]
}

export type OralSectionStatus = { sectionNo: number; status: string }

export type OralSessionDetail = OralSessionSummary & { responses: OralSectionStatus[] }

// Wire shape of the `config` JSONB column on oral_exam_sessions — frozen at
// session start by start_oral_exam_session() (mig 153): { mode, sections }.
type RawConfig = { mode?: unknown; sections?: unknown }
type RawSection = { section_no?: unknown; type?: unknown }
type RawResponse = { section_no?: unknown; status?: unknown }

function toSections(raw: unknown): { sectionNo: number; type: string }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is RawSection => typeof s === 'object' && s !== null)
    .map((s) => ({ sectionNo: Number(s.section_no ?? 0), type: String(s.type ?? '') }))
}

function toSummary(row: { id: string; status: string; config: unknown }): OralSessionSummary {
  const config = (row.config ?? {}) as RawConfig
  return {
    id: row.id,
    status: row.status,
    mode: typeof config.mode === 'string' ? config.mode : 'mock',
    sections: toSections(config.sections),
  }
}

function toResponses(raw: unknown): OralSectionStatus[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is RawResponse => typeof r === 'object' && r !== null)
    .map((r) => ({ sectionNo: Number(r.section_no ?? 0), status: String(r.status ?? '') }))
}

/**
 * Fetch the caller's active (not-yet-ended, not-deleted) oral exam session, if
 * any. RLS (students_own_oral_sessions) scopes rows to the caller. Returns
 * null when the student has no active session — this is the expected entry-
 * gating branch, not an error.
 */
export async function getActiveOralExamSession(): Promise<OralSessionSummary | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('oral_exam_sessions')
    .select('id, status, config')
    .is('ended_at', null)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; status: string; config: unknown }>()
  if (error) {
    throw new Error(`Failed to fetch active oral session: ${error.message}`)
  }
  if (!data) return null

  return toSummary(data)
}

/**
 * Fetch a single oral exam session by id, including its section responses'
 * statuses. Used by the practice runner and the report-pending page. Does NOT
 * filter on ended_at — a graded session has ended_at set and must still be
 * readable. RLS scopes rows to the caller (or org staff); deleted_at is
 * filtered explicitly since SELECTs are not inside a SECURITY DEFINER RPC here.
 */
export async function getOralExamSession(sessionId: string): Promise<OralSessionDetail | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase
    .from('oral_exam_sessions')
    .select('id, status, config, oral_exam_section_responses!session_id(section_no, status)')
    .eq('id', sessionId)
    .is('deleted_at', null)
    .maybeSingle<{
      id: string
      status: string
      config: unknown
      oral_exam_section_responses: unknown
    }>()
  if (error) {
    throw new Error(`Failed to fetch oral session: ${error.message}`)
  }
  if (!data) return null

  return {
    ...toSummary(data),
    responses: toResponses(data.oral_exam_section_responses),
  }
}
