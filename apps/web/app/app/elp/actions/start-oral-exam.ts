'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'

export type OralExamSection = { sectionNo: number; type: string }

export type StartOralExamResult =
  | {
      success: true
      sessionId: string
      status: string
      sections: OralExamSection[]
      startedAt: string
      mode: string
    }
  | { success: false; error: string }

const OralExamMode = z.enum(['practice', 'mock'])

// Wire shape returned by start_oral_exam_session().
type StartRpcResult = {
  session_id: string
  status: string
  sections: unknown
  started_at: string
  mode: string
}

function toSections(raw: unknown): OralExamSection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (s): s is { section_no?: unknown; type?: unknown } => typeof s === 'object' && s !== null,
    )
    .map((row) => ({ sectionNo: Number(row.section_no ?? 0), type: String(row.type ?? '') }))
}

function validateMode(rawMode: unknown): z.infer<typeof OralExamMode> | null {
  const parsed = OralExamMode.safeParse(rawMode)
  return parsed.success ? parsed.data : null
}

function mapStartRpcError(msg: string): string {
  if (msg.includes('another_oral_exam_active')) return 'You already have an oral exam in progress.'
  if (msg.includes('user_not_found_or_inactive'))
    return 'Your account is inactive. Please contact your administrator.'
  return 'Failed to start oral exam. Please try again.'
}

export async function startOralExam(rawMode: unknown): Promise<StartOralExamResult> {
  const mode = validateMode(rawMode)
  if (!mode) return { success: false, error: 'Invalid mode' }

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await rpc<StartRpcResult>(supabase, 'start_oral_exam_session', {
      p_mode: mode,
    })
    if (error || !data) {
      console.error('[startOralExam] RPC error:', error?.message ?? 'no data returned')
      return { success: false, error: mapStartRpcError(error?.message ?? '') }
    }

    return {
      success: true,
      sessionId: data.session_id,
      status: data.status,
      sections: toSections(data.sections),
      startedAt: data.started_at,
      mode: data.mode,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[startOralExam] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
