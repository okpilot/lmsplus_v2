import { useEffect, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode } from '@/lib/constants/exam-modes'
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

  useEffect(() => {
    let cancelled = false
    loadSessionData(questionIds, { sessionId, ...toRunnerMode(mode) })
      .then((r) => !cancelled && setState(toLoaded(r)))
      .catch(() => !cancelled && setState({ ...PENDING, error: LOAD_FAILED }))
    return () => {
      cancelled = true
    }
  }, [sessionId, questionIds, mode])

  return state
}
