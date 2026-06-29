import { sessionHandoffKey } from '@/app/app/quiz/session/_utils/quiz-session-handoff'

export type UseVfrRtStartOpts = {
  userId: string
  subjectId: string
  topicIds: string[]
  count: number
  maxQuestions: number
}

/** Writes the RT session handoff to sessionStorage. Returns false on error. */
export function writeRtHandoff(userId: string, sessionId: string, questionIds: string[]): boolean {
  try {
    sessionStorage.setItem(
      sessionHandoffKey(userId),
      JSON.stringify({ userId, sessionId, questionIds, subjectName: 'VFR RT', subjectCode: 'RT' }),
    )
    return true
  } catch {
    return false
  }
}

/** Prompts the user to confirm overwriting an in-progress quiz. */
export function confirmRtOverwrite(subjectName?: string): boolean {
  const suffix = subjectName ? ` (${subjectName})` : ''
  return globalThis.confirm(
    `You have an unfinished quiz${suffix}. Starting a new quiz will lose it. Continue?`,
  )
}
