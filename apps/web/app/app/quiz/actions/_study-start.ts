// Payload parsing + orphan teardown for startStudy. No 'use server' — imported by study.ts.
import { parseStudyQuestions } from '@/lib/queries/study-queries'
import { endDiscovery } from './end-discovery'
import type { StartStudyResult } from './study'

/**
 * Validates the `start_discovery` payload shape; null when it is malformed. The deck must equal
 * the session's configured ids, so a payload where any question row fails to parse is malformed.
 */
export function parseStarted(data: unknown): StartStudyResult | null {
  if (data === null || typeof data !== 'object') return null
  const { session_id, questions, flagged_ids } = data as Record<string, unknown>
  const rawLen = Array.isArray(questions) ? questions.length : -1
  const parsed = parseStudyQuestions(questions)
  // Empty draw: the RPC creates no row and returns session_id null.
  if (session_id === null && rawLen === 0) return { success: true, questions: [], flaggedIds: [] }
  if (typeof session_id !== 'string' || session_id === '') return null
  if (rawLen <= 0 || parsed.length !== rawLen) return null
  const flaggedIds = Array.isArray(flagged_ids)
    ? flagged_ids.filter((id): id is string => typeof id === 'string')
    : []
  return { success: true, questions: parsed, flaggedIds, sessionId: session_id }
}

/**
 * Best-effort end of the discovery row a malformed payload may have created (the RPC commits
 * before the payload is validated). Hygiene only: each start RPC (exam, internal exam, VFR RT,
 * quiz, Discovery) clears the caller's discovery rows, so the row blocks no later start.
 * endDiscovery returns { success: false } rather than throwing; a failure is logged.
 */
export async function discardOrphanedSession(data: unknown): Promise<void> {
  if (data === null || typeof data !== 'object') return
  const sessionId = (data as Record<string, unknown>).session_id
  if (typeof sessionId !== 'string' || sessionId === '') return
  const teardown = await endDiscovery({ sessionId }).catch(() => null)
  if (!teardown?.success) {
    console.error(
      '[startStudy] discovery teardown failed:',
      sessionId,
      teardown?.error ?? 'unknown error',
    )
  }
}
