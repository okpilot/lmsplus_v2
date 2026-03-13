import type { useRouter } from 'next/navigation'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import { deleteDraft } from '../../actions/draft-delete'
import type { DraftAnswer } from '../../types'

type AppRouterInstance = ReturnType<typeof useRouter>

export async function submitQuizSession(
  sessionId: string,
  answers: Map<string, DraftAnswer>,
  draftId?: string,
) {
  const answerArray = Array.from(answers.entries()).map(([qId, a]) => ({
    questionId: qId,
    selectedOptionId: a.selectedOptionId,
    responseTimeMs: a.responseTimeMs,
  }))
  try {
    const result = await batchSubmitQuiz({ sessionId, answers: answerArray })
    if (!result.success) return { success: false as const, error: result.error }
    if (draftId) {
      deleteDraft({ draftId }).catch((e) =>
        console.error('[submitQuizSession] Draft cleanup failed:', e),
      )
    }
    return result
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function discardQuizSession(
  sessionId: string,
  router: AppRouterInstance,
  draftId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await discardQuiz({ sessionId, draftId })
    if (!result.success) return result
    router.push('/app/quiz')
    return { success: true }
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function saveQuizDraft(opts: {
  sessionId: string
  questionIds: string[]
  answers: Map<string, DraftAnswer>
  currentIndex: number
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
}) {
  const answerObj = Object.fromEntries(opts.answers)
  const result = await saveDraft({
    draftId: opts.draftId,
    sessionId: opts.sessionId,
    questionIds: opts.questionIds,
    answers: answerObj,
    currentIndex: opts.currentIndex,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  if (result.success) {
    opts.router.push('/app/quiz')
    return { success: true as const }
  }
  return { success: false as const, error: result.error }
}
