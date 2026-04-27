import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { startExamSession } from '../actions/start-exam'
import {
  clearActiveSession,
  readActiveSession,
  sessionHandoffKey,
} from '../session/_utils/quiz-session-storage'

type UseExamStartOpts = {
  userId: string
  subjectId: string
  examSubjects: ExamSubjectOption[]
}

export function useExamStart(opts: UseExamStartOpts) {
  const { userId, subjectId, examSubjects } = opts
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (loading || !subjectId) return

    const existing = readActiveSession(userId)
    if (existing) {
      const suffix = existing.subjectName ? ` (${existing.subjectName})` : ''
      const msg = `You have an unfinished quiz${suffix}. Starting an exam will lose it. Continue?`
      if (!globalThis.confirm(msg)) return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await startExamSession({ subjectId })
      if (result.success) {
        const selectedSubject = examSubjects.find((s) => s.id === subjectId)
        try {
          sessionStorage.setItem(
            sessionHandoffKey(userId),
            JSON.stringify({
              userId,
              sessionId: result.sessionId,
              questionIds: result.questionIds,
              subjectName: selectedSubject?.name,
              subjectCode: selectedSubject?.short,
              mode: 'exam',
              timeLimitSeconds: result.timeLimitSeconds,
              passMark: result.passMark,
              startedAt: result.startedAt,
            }),
          )
        } catch (err) {
          console.warn('[use-exam-start] sessionStorage handoff failed:', err)
          setError('Unable to start Practice Exam right now. Please try again.')
          setLoading(false)
          return
        }
        if (existing) clearActiveSession(userId)
        router.push('/app/quiz/session')
        return
      }
      setError(result.error)
      setLoading(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return { loading, error, handleStart }
}
