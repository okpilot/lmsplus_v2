import type { AnswerResult, CompleteResult, SubmitInput } from '../_types/session'

export async function executeSubmit(
  onSubmitAnswer: (input: SubmitInput) => Promise<AnswerResult>,
  input: SubmitInput,
): Promise<AnswerResult> {
  try {
    return await onSubmitAnswer(input)
  } catch (err) {
    console.error('Failed to submit answer:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function executeComplete(
  onComplete: (input: { sessionId: string }) => Promise<CompleteResult>,
  sessionId: string,
): Promise<CompleteResult> {
  try {
    return await onComplete({ sessionId })
  } catch (err) {
    console.error('Failed to complete session:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
