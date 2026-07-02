'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

export type OralExamSection = { sectionNo: number; type: string }

export type StartOralExamResult =
  | {
      success: true
      sessionId: string
      status: string
      sections: OralExamSection[]
      startedAt: string
    }
  | { success: false; error: string }

// Wire shape returned by start_oral_exam_session().
type StartRpcResult = {
  session_id: string
  status: string
  sections: unknown
  started_at: string
}

function toSections(raw: unknown): OralExamSection[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (s): s is { section_no?: unknown; type?: unknown } => typeof s === 'object' && s !== null,
    )
    .map((row) => ({ sectionNo: Number(row.section_no ?? 0), type: String(row.type ?? '') }))
}

export async function startOralExam(): Promise<StartOralExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const { data, error } = await rpc<StartRpcResult>(supabase, 'start_oral_exam_session', {})
    if (error || !data) {
      console.error('[startOralExam] RPC error:', error?.message ?? 'no data returned')
      const msg = error?.message ?? ''
      const userMessage = msg.includes('another_oral_exam_active')
        ? 'You already have an oral exam in progress.'
        : msg.includes('user_not_found_or_inactive')
          ? 'Your account is inactive. Please contact your administrator.'
          : 'Failed to start oral exam. Please try again.'
      return { success: false, error: userMessage }
    }

    return {
      success: true,
      sessionId: data.session_id,
      status: data.status,
      sections: toSections(data.sections),
      startedAt: data.started_at,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[startOralExam] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
