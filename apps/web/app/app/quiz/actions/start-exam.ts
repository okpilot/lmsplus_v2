'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { matchRpcError, type RpcErrorPattern } from '@/lib/rpc-error-match'
import type { StartExamResult } from '../types'
import { blockedFailure, type WithBlocked } from './_blocked-start'
import { NOT_ACTIVE, SIGN_IN } from './progress-error-messages'

const StartExamInput = z.object({
  subjectId: z.uuid(),
})

const StartExamRpcResultSchema = z.object({
  session_id: z.uuid(),
  question_ids: z.array(z.uuid()),
  time_limit_seconds: z.number().int().positive(),
  total_questions: z.number().int().positive(),
  // DB CHECK: pass_mark > 0 AND pass_mark <= 100. Tighten Zod to match — extractPassMark
  // and the session-storage validator both reject 0, so this avoids a server-accepts /
  // client-rejects split-brain.
  pass_mark: z.number().int().min(1).max(100),
  started_at: z.string(),
})

const FAILED = 'Failed to start Practice Exam.'

// RAISE texts of start_exam_session, incl. the auth guards. The distribution-total RAISE falls to FAILED.
const START_EXAM_ERRORS: Record<string, string> = {
  'not authenticated': SIGN_IN,
  'user not found or inactive': NOT_ACTIVE,
  'an exam session is already in progress for this subject':
    'A Practice Exam is already in progress for this subject.',
  'no exam configuration found for this subject':
    'Practice Exam is not configured for this subject.',
}

const START_EXAM_ERROR_PATTERNS: ReadonlyArray<RpcErrorPattern<string>> = [
  [
    /^not enough active questions for topic .+ \(subtopic .+\)\. Need \d+, found \d+$/,
    'Not enough questions available to start this Practice Exam.',
  ],
]

export async function startExamSession(raw: unknown): Promise<WithBlocked<StartExamResult>> {
  try {
    const supabase = await createServerSupabaseClient()
    if (!(await verifySessionUser(supabase))) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof StartExamInput>
    try {
      input = StartExamInput.parse(raw)
    } catch {
      console.error('[startExamSession] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await supabase.rpc('start_exam_session', {
      p_subject_id: input.subjectId,
    })

    if (error || !data) {
      const rpcMessage = error?.message ?? 'unknown RPC error'
      console.error('[startExamSession] RPC error:', rpcMessage)

      const blocked = blockedFailure(rpcMessage)
      if (blocked) return blocked
      return {
        success: false,
        error: matchRpcError(rpcMessage, START_EXAM_ERRORS, START_EXAM_ERROR_PATTERNS) ?? FAILED,
      }
    }

    const parsed = StartExamRpcResultSchema.safeParse(data)
    if (!parsed.success) {
      const failedFields = parsed.error.issues.map((i) => i.path.join('.'))
      console.error('[startExamSession] Invalid RPC payload, fields:', failedFields)
      return { success: false, error: FAILED }
    }

    return {
      success: true,
      sessionId: parsed.data.session_id,
      questionIds: parsed.data.question_ids,
      totalQuestions: parsed.data.total_questions,
      timeLimitSeconds: parsed.data.time_limit_seconds,
      passMark: parsed.data.pass_mark,
      startedAt: parsed.data.started_at,
    }
  } catch (err) {
    console.error('[startExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
