import { saveBlockingQuizForLater } from '../actions/save-blocking-quiz'
import { clearActiveSessionById } from '../session/_utils/clear-active-session-by-id'
import { getQuizDeviceId } from '../session/_utils/quiz-device-id'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** One action does room check → claim → save for later (ordering lives server-side). */
async function tryFree(sessionId: string): Promise<string | null> {
  const saved = await saveBlockingQuizForLater({ sessionId, deviceId: getQuizDeviceId() })
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
