import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { deleteDraft, saveDraft } from '../../actions/draft'

type StoredAnswer = { selectedOptionId: string; responseTimeMs: number }

export async function submitQuizSession(sessionId: string, answers: Map<string, StoredAnswer>) {
  const answerArray = Array.from(answers.entries()).map(([qId, a]) => ({
    questionId: qId,
    selectedOptionId: a.selectedOptionId,
    responseTimeMs: a.responseTimeMs,
  }))
  try {
    const result = await batchSubmitQuiz({ sessionId, answers: answerArray })
    if (!result.success) return { success: false as const, error: result.error }
    deleteDraft().catch((e) => console.error('[submitQuizSession] Draft cleanup failed:', e))
    return result
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function saveQuizDraft(opts: {
  sessionId: string
  questionIds: string[]
  answers: Map<string, StoredAnswer>
  currentIndex: number
  router: AppRouterInstance
}) {
  const answerObj = Object.fromEntries(opts.answers)
  const result = await saveDraft({
    sessionId: opts.sessionId,
    questionIds: opts.questionIds,
    answers: answerObj,
    currentIndex: opts.currentIndex,
  })
  if (result.success) {
    opts.router.push('/app/quiz')
    return { success: true as const }
  }
  return { success: false as const, error: result.error }
}
