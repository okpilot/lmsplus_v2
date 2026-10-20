'use server'

import { refresh } from 'next/cache'
import type { ActionResult } from '@/lib/action-result'
import { discardQuiz } from './discard'
import { deleteDraft } from './draft-delete'
import { discardSavedQuiz } from './saved-quiz'

/**
 * Discard for the in-place banners: on success the current route is re-rendered inside
 * this action's response (one browser round trip). The session page keeps `discardQuiz`
 * and navigates away, so it must not re-render its own route.
 */
export async function discardQuizAndRefresh(raw: unknown): Promise<ActionResult> {
  const result = await discardQuiz(raw)
  if (result.success) refresh()
  return result
}

/** Saved-quiz delete for the list: the re-render rides this action's response. */
export async function discardSavedQuizAndRefresh(raw: unknown) {
  const result = await discardSavedQuiz(raw)
  if (result.success) refresh()
  return result
}

/** Draft delete for the list: the re-render rides this action's response. */
export async function deleteDraftAndRefresh(raw: unknown) {
  const result = await deleteDraft(raw)
  if (result.success) refresh()
  return result
}
