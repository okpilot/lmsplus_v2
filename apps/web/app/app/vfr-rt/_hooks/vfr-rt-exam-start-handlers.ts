import type { useRouter } from 'next/navigation'
import { confirmStartOverwrite, failStart } from '@/app/app/quiz/_hooks/start-handler-shared'
import { sessionHandoffKey } from '@/app/app/quiz/session/_utils/quiz-session-handoff'
import {
  type ActiveSession,
  buildActiveSession,
  readActiveSession,
  writeActiveSession,
} from '@/app/app/quiz/session/_utils/quiz-session-storage'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { startVfrRtExam } from '../../vfr-rt-exam/actions/start'

type AppRouterInstance = ReturnType<typeof useRouter>

/** The start RPC returns no pass mark; the runner needs one — every VFR RT part requires 75%. */
const VFR_RT_EXAM_PASS_MARK = 75

export type UseVfrRtExamStartOpts = {
  userId: string
  subjectId: string
  subjects: SubjectOption[]
}

export type VfrRtExamStartDeps = UseVfrRtExamStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  inFlight: React.RefObject<boolean>
}

type StartSuccess = {
  sessionId: string
  questionIds: string[]
  timeLimitSeconds: number
  startedAt: string
}

/** An existing local session for the SAME server exam is a resume, not an overwrite. */
function isSameExam(existing: ActiveSession | null, sessionId: string): existing is ActiveSession {
  return existing?.sessionId === sessionId && existing.examMode === 'vfr_rt_exam'
}

function buildHandoffBase(deps: VfrRtExamStartDeps, result: StartSuccess) {
  const subject = deps.subjects.find((s) => s.id === deps.subjectId)
  return {
    userId: deps.userId,
    sessionId: result.sessionId,
    questionIds: result.questionIds,
    subjectName: subject?.name,
    subjectCode: subject?.short,
    mode: 'exam' as const,
    examMode: 'vfr_rt_exam' as const,
    timeLimitSeconds: result.timeLimitSeconds,
    passMark: VFR_RT_EXAM_PASS_MARK,
    startedAt: result.startedAt,
  }
}

/** Seeds the localStorage active session with an empty answer buffer. */
function seedActiveSession(base: ReturnType<typeof buildHandoffBase>) {
  const questions = base.questionIds.map((id) => ({ id }))
  writeActiveSession(buildActiveSession({ ...base, questions }, new Map(), 0))
}

/**
 * Writes the sessionStorage handoff and seeds the localStorage active session (so a
 * reload before the first answer shows the recovery prompt). Returns false on a storage
 * failure so the caller surfaces a message instead of navigating to an empty session.
 */
function writeHandoff(
  deps: VfrRtExamStartDeps,
  result: StartSuccess,
  resume: ActiveSession | null,
): boolean {
  const base = buildHandoffBase(deps, result)
  try {
    sessionStorage.setItem(
      sessionHandoffKey(deps.userId),
      JSON.stringify({
        ...base,
        ...(resume && {
          draftAnswers: resume.answers,
          draftFeedback: resume.feedback,
          draftCurrentIndex: resume.currentIndex,
          draftId: resume.draftId,
        }),
      }),
    )
  } catch (err) {
    console.warn('[use-vfr-rt-exam-start] sessionStorage handoff failed:', err)
    return false
  }
  if (!resume) seedActiveSession(base)
  return true
}

export function buildVfrRtExamStartHandler(deps: VfrRtExamStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    const existing = readActiveSession(deps.userId)
    const resumable = existing?.examMode === 'vfr_rt_exam'
    if (!resumable && !confirmStartOverwrite(existing, 'the exam')) return
    // Lock AFTER the confirm early-return (code-style §6): a cancelled confirm stays retryable.
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    try {
      const result = await startVfrRtExam({ subjectId: deps.subjectId })
      if (!result.success) return failStart(deps, result.error)
      const resume = isSameExam(existing, result.sessionId) ? existing : null
      if (!writeHandoff(deps, result, resume)) {
        return failStart(deps, 'Unable to start the exam right now. Please try again.')
      }
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push('/app/quiz/session')
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
