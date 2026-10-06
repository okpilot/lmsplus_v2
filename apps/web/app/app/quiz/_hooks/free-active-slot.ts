import { claimQuizSession } from '../actions/quiz-progress'
import { checkSavedQuizRoom, saveQuizForLater } from '../actions/saved-quiz'
import { clearActiveSessionById } from '../session/_utils/clear-active-session-by-id'
import { getQuizDeviceId } from '../session/_utils/quiz-device-id'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** room check → claim → save for later: frees the single active-session slot. */
async function tryFree(sessionId: string): Promise<string | null> {
  // Checked first: a refused save after the claim would already have taken the quiz over.
  const room = await checkSavedQuizRoom()
  if (!room.success) return room.error
  const deviceId = getQuizDeviceId()
  // The student is taking the quiz over: without the claim, saving raises
  // `session_taken_over` when another device holds it.
  const claim = await claimQuizSession({ sessionId, deviceId })
  if (!claim.success) return claim.error
  const saved = await saveQuizForLater({ sessionId, deviceId })
  if (!saved.success) return saved.error
  // Drop a legacy local copy that still names the saved session.
  clearActiveSessionById(sessionId)
  return null
}

/** Frees the active-session slot; resolves the error to show, or null. A throw is reported as the generic error; never rejects. */
export async function freeActiveSlot(sessionId: string): Promise<string | null> {
  try {
    return await tryFree(sessionId)
  } catch {
    return GENERIC_ERROR
  }
}
