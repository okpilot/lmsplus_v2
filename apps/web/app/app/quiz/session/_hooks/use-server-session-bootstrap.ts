import { useEffect, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode } from '@/lib/constants/exam-modes'
import { clearActiveSessionsExcept } from '../_utils/clear-active-session-copies'
import { toRunnerMode } from '../_utils/session-runner-mode'
import { loadSessionData, type SessionLoadResult } from './session-bootstrap-load'

type Opts = { sessionId: string; questionIds: string[]; mode: QuizMode }

type Loaded = {
  questions: SessionQuestion[] | null
  flaggedIds: string[]
  claimError: string | null
  error: string | null
}

const PENDING: Loaded = { questions: null, flaggedIds: [], claimError: null, error: null }
const LOAD_FAILED = 'Failed to load questions. Please try again.'

function toLoaded(r: SessionLoadResult): Loaded {
  if (!r.success) return { ...PENDING, error: r.error }
  return {
    ...PENDING,
    questions: r.questions,
    flaggedIds: r.flaggedIds,
    claimError: r.claimError ?? null,
  }
}

/** Mount bootstrap of a server-loaded session: questions, flags, then the tab's claim. */
export function useServerSessionBootstrap({ sessionId, questionIds, mode }: Readonly<Opts>) {
  const [state, setState] = useState<Loaded>(PENDING)
  // A fresh array identity on an RSC refresh must not refetch and re-claim the session.
  const questionIdsRef = useRef(questionIds)
  questionIdsRef.current = questionIds

  useEffect(() => {
    let cancelled = false
    loadSessionData(questionIdsRef.current, { sessionId, ...toRunnerMode(mode) })
      .then((r) => {
        // The opened session is the student's only active one (docs/security.md §11d).
        if (r.success) clearActiveSessionsExcept(sessionId)
        if (!cancelled) setState(toLoaded(r))
      })
      .catch(() => !cancelled && setState({ ...PENDING, error: LOAD_FAILED }))
    return () => {
      cancelled = true
    }
  }, [sessionId, mode])

  return state
}
