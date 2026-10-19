'use server'

import { INVALID_INPUT } from './progress-error-messages'
import { claimQuizSession } from './quiz-progress'
import type { ProgressResult } from './quiz-progress-helpers'
import { ClaimInput } from './quiz-progress-schema'
import { checkSavedQuizRoom, saveQuizForLater } from './saved-quiz'

/**
 * Frees the active-session slot for a blocked start in one browser round trip. Order matters:
 * room first (a save refused after the claim would leave the quiz taken over), claim next (saving
 * checks the device), save last.
 */
export async function saveBlockingQuizForLater(raw: unknown): Promise<ProgressResult> {
  const parsed = ClaimInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: INVALID_INPUT }
  const room = await checkSavedQuizRoom()
  if (!room.success) return room
  const claim = await claimQuizSession(parsed.data)
  if (!claim.success) return claim
  return saveQuizForLater(parsed.data)
}
