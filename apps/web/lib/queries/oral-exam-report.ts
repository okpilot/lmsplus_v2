import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

// One descriptor score (aggregate, or per-section) on the ICAO 1–6 scale.
export type OralDescriptorScore = {
  descriptor: string
  level: number
  rationale: string | null
}

export type OralSectionReport = {
  sectionNo: number
  status: string
  transcriptText: string | null
  scores: OralDescriptorScore[]
}

export type OralExamReport = {
  sessionId: string
  status: string
  // MIN across the six aggregate descriptors (weakest-link final level); null until graded.
  totalFinalLevel: number | null
  startedAt: string
  endedAt: string | null
  descriptors: OralDescriptorScore[]
  sections: OralSectionReport[]
}

// Wire shape from get_oral_exam_report. level / total_final_level originate from
// SMALLINT (arrive as numbers) but are coerced with Number() defensively per code-style §5.
type ReportRpcResult = {
  session_id: string
  status: string
  total_final_level: number | string | null
  started_at: string
  ended_at: string | null
  descriptors: unknown
  sections: unknown
}

type RawScore = { descriptor?: unknown; level?: unknown; rationale?: unknown }
type RawSection = {
  section_no?: unknown
  status?: unknown
  transcript_text?: unknown
  scores?: unknown
}

function toScore(raw: RawScore): OralDescriptorScore {
  return {
    descriptor: String(raw.descriptor ?? ''),
    level: Number(raw.level ?? 0),
    rationale: raw.rationale == null ? null : String(raw.rationale),
  }
}

function toScores(raw: unknown): OralDescriptorScore[] {
  return Array.isArray(raw) ? raw.map((s) => toScore(s as RawScore)) : []
}

function toSection(raw: RawSection): OralSectionReport {
  return {
    sectionNo: Number(raw.section_no ?? 0),
    status: String(raw.status ?? ''),
    transcriptText: raw.transcript_text == null ? null : String(raw.transcript_text),
    scores: toScores(raw.scores),
  }
}

/**
 * Fetch a graded oral-exam report for the given session. Returns null when the
 * session is missing, not owned by the caller, or not yet complete — the page
 * redirects on null. The RPC (get_oral_exam_report) enforces auth + ownership.
 */
export async function getOralExamReport(sessionId: string): Promise<OralExamReport | null> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await rpc<ReportRpcResult>(supabase, 'get_oral_exam_report', {
    p_session_id: sessionId,
  })
  if (error || !data) {
    if (error) console.error('[getOralExamReport] RPC error:', error.message)
    return null
  }

  return {
    sessionId: data.session_id,
    status: data.status,
    totalFinalLevel: data.total_final_level == null ? null : Number(data.total_final_level),
    startedAt: data.started_at,
    endedAt: data.ended_at,
    descriptors: toScores(data.descriptors),
    sections: Array.isArray(data.sections)
      ? data.sections.map((s) => toSection(s as RawSection))
      : [],
  }
}
