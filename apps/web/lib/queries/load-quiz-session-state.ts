import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { extractPassMark, extractQuestionIds } from '@/app/app/quiz/actions/_overdue-helpers'
import { type QuizMode, VFR_RT_EXAM_PASS_MARK } from '@/lib/constants/exam-modes'
import { rpc } from '@/lib/supabase-rpc'
import { buildSessionSeed, type SessionSeed } from './quiz-session-seed'

const MODES = [
  'smart_review',
  'quick_quiz',
  'mock_exam',
  'internal_exam',
  'vfr_rt_exam',
  'discovery',
] as const satisfies readonly QuizMode[]

const ProgressPayload = z.object({
  status: z.enum(['open', 'saved', 'ended', 'discarded']),
  mode: z.enum(MODES),
  current_index: z.number().int(),
  pinned_question_ids: z.array(z.string()),
  answers: z.array(
    z.object({
      question_id: z.string(),
      answer: z.unknown(),
      time_spent_ms: z.number().int().nonnegative(),
    }),
  ),
})

const SessionRow = z.object({
  config: z.unknown(),
  started_at: z.string(),
  time_limit_seconds: z.number().int().nullable(),
  easa_subjects: z.object({ name: z.string(), short: z.string() }).nullable(),
})

type SessionStateData = {
  sessionId: string
  mode: Exclude<QuizMode, 'discovery'>
  questionIds: string[]
  startedAt: string
  seed: SessionSeed
  timeLimitSeconds?: number
  passMark?: number
  subjectName?: string
  subjectCode?: string
}

type QuizSessionState =
  | { kind: 'not_found' }
  | { kind: 'discarded' }
  | { kind: 'ended'; mode: QuizMode }
  | ({ kind: 'open' } & SessionStateData)
  | ({ kind: 'saved' } & SessionStateData)

export type SessionEntry = Extract<QuizSessionState, { kind: 'open' | 'saved' }>

const NOT_FOUND: QuizSessionState = { kind: 'not_found' }
const LOAD_FAILED = 'Failed to load quiz session'

function fail(label: string, detail: string): never {
  console.error(`[loadQuizSessionState] ${label}:`, detail)
  throw new Error(LOAD_FAILED)
}

function passMarkFor(mode: QuizMode, config: unknown): number | undefined {
  if (mode === 'quick_quiz' || mode === 'smart_review') return undefined
  return extractPassMark(config) ?? (mode === 'vfr_rt_exam' ? VFR_RT_EXAM_PASS_MARK : undefined)
}

function toEntry(
  sessionId: string,
  progress: z.infer<typeof ProgressPayload>,
  row: z.infer<typeof SessionRow>,
): QuizSessionState {
  const questionIds = extractQuestionIds(row.config)
  if (progress.mode === 'discovery' || !questionIds) return NOT_FOUND
  const seed = buildSessionSeed({
    rows: progress.answers,
    questionIds,
    pinnedQuestionIds: progress.pinned_question_ids,
    currentIndex: progress.current_index,
  })
  return {
    kind: progress.status === 'saved' ? 'saved' : 'open',
    sessionId,
    mode: progress.mode,
    questionIds,
    startedAt: row.started_at,
    seed,
    timeLimitSeconds: row.time_limit_seconds ?? undefined,
    passMark: passMarkFor(progress.mode, row.config),
    subjectName: row.easa_subjects?.name,
    subjectCode: row.easa_subjects?.short,
  }
}

/**
 * Loads one of the student's quiz sessions by id: status and mode and the saved progress from
 * get_quiz_progress, the config and subject from quiz_sessions. Returns not_found for another
 * student's id, a non-uuid id and a Discovery session; throws on a failed read.
 */
export async function loadQuizSessionState(
  sessionId: string,
  userId: string,
): Promise<QuizSessionState> {
  if (!z.uuid().safeParse(sessionId).success) return NOT_FOUND
  const supabase = await createServerSupabaseClient()
  // quiz_sessions has several permissive SELECT policies: the student_id predicate is mandatory (security.md).
  const [progressRes, rowRes] = await Promise.all([
    rpc<unknown>(supabase, 'get_quiz_progress', { p_session_id: sessionId }),
    supabase
      .from('quiz_sessions')
      .select('config, started_at, time_limit_seconds, easa_subjects!subject_id(name, short)')
      .eq('id', sessionId)
      .eq('student_id', userId)
      .maybeSingle(),
  ])
  if (progressRes.error?.message === 'session_not_found') return NOT_FOUND
  if (progressRes.error) fail('progress RPC', progressRes.error.message)
  if (rowRes.error) fail('session query', rowRes.error.message)
  const progress = ProgressPayload.safeParse(progressRes.data)
  if (!progress.success) return fail('progress shape', progress.error.message)
  if (progress.data.mode === 'discovery') return NOT_FOUND
  if (progress.data.status === 'discarded') return { kind: 'discarded' }
  if (progress.data.status === 'ended') return { kind: 'ended', mode: progress.data.mode }
  const row = SessionRow.safeParse(rowRes.data)
  if (!row.success) return rowRes.data === null ? NOT_FOUND : fail('row shape', row.error.message)
  return toEntry(sessionId, progress.data, row.data)
}
