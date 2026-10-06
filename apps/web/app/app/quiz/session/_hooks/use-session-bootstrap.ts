import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { clearSessionHandoff } from '../_utils/quiz-session-handoff'
import {
  applyInitialLoad,
  dropCachedSession,
  loadSessionData,
  readBootstrapSession,
} from './session-bootstrap-load'
import { useBootstrapState } from './use-bootstrap-state'

export type BootstrapState = ReturnType<typeof useSessionBootstrap>

/** Serves Discovery only; any other handoff, or none, goes back to the quiz hub. */
export function useSessionBootstrap(userId: string) {
  const router = useRouter()
  const { state, setters } = useBootstrapState()
  const { questions } = state

  useEffect(() => {
    if (questions) dropCachedSession(userId)
  }, [questions, userId])

  useEffect(() => {
    const data = readBootstrapSession(userId)
    if (data?.mode !== 'discovery') {
      clearSessionHandoff(userId)
      dropCachedSession(userId)
      router.replace('/app/quiz')
      return
    }
    setters.setSession(data)
    // Flags, questions, then the claim; QuizSession mounts once, after all settle.
    loadSessionData(data.questionIds, data)
      .then((r) => applyInitialLoad(r, userId, setters))
      // Error-path net: a throwing setter must not strand the skeleton.
      .catch(() => setters.setError('Failed to load questions. Please try again.'))
  }, [router, userId, setters])

  return state
}
