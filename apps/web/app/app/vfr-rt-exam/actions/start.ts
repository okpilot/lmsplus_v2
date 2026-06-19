'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { START_VFR_RT_EXAM_ERROR_MESSAGES } from './_error-messages'

const StartVfrRtExamInput = z.object({
  subjectId: z.uuid(),
})

const PartsSchema = z.object({
  p1_end: z.number().int().nonnegative(),
  p2_end: z.number().int().nonnegative(),
  p3_end: z.number().int().nonnegative(),
})

const RpcResultSchema = z.object({
  session_id: z.uuid(),
  question_ids: z.array(z.uuid()),
  time_limit_seconds: z.number().int().positive(),
  parts: PartsSchema,
  started_at: z.string(),
})

type StartRpcResult = z.infer<typeof RpcResultSchema>

export type StartVfrRtExamResult =
  | {
      success: true
      sessionId: string
      questionIds: string[]
      timeLimitSeconds: number
      parts: { p1End: number; p2End: number; p3End: number }
      startedAt: string
    }
  | { success: false; error: string }

function mapRpcError(message: string): string {
  for (const [token, friendly] of START_VFR_RT_EXAM_ERROR_MESSAGES) {
    if (message.includes(token)) return friendly
  }
  return 'Failed to start exam'
}

export async function startVfrRtExam(raw: unknown): Promise<StartVfrRtExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const parsed = StartVfrRtExamInput.safeParse(raw)
    if (!parsed.success) {
      console.error('[startVfrRtExam] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await rpc<StartRpcResult>(supabase, 'start_vfr_rt_exam_session', {
      p_subject_id: parsed.data.subjectId,
    })

    if (error) {
      console.error('[startVfrRtExam] RPC error:', error.message)
      return { success: false, error: mapRpcError(error.message) }
    }

    const row: unknown = Array.isArray(data) ? data[0] : data
    const rowParsed = RpcResultSchema.safeParse(row)
    if (!rowParsed.success) {
      const failedFields = rowParsed.error.issues.map((i) => i.path.join('.'))
      console.error('[startVfrRtExam] Invalid RPC payload, fields:', failedFields)
      return { success: false, error: 'Failed to start exam' }
    }

    const r: StartRpcResult = rowParsed.data
    return {
      success: true,
      sessionId: r.session_id,
      questionIds: r.question_ids,
      timeLimitSeconds: r.time_limit_seconds,
      // camelCase the client-facing contract — the rest of this return is
      // camelCase; parts is the only nested object echoed from the RPC.
      parts: { p1End: r.parts.p1_end, p2End: r.parts.p2_end, p3End: r.parts.p3_end },
      startedAt: r.started_at,
    }
  } catch (err) {
    console.error('[startVfrRtExam] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
