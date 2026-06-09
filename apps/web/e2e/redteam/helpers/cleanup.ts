/**
 * Shared fixture tracker and cleanup helper for red-team Playwright specs.
 *
 * Usage:
 *   const tracker = createFixtureTracker()
 *   // ... tests that populate tracker.sessions.add(id) etc. ...
 *   test.afterEach(() => cleanupFixtures(admin, tracker))
 *
 * Cleanup policy per table (code-style.md §7 hermiticity):
 *   quiz_sessions         → soft-delete (deleted_at = now())  FK-parent
 *   internal_exam_codes   → soft-delete (deleted_at = now())  FK-parent
 *   flagged_questions     → soft-delete (deleted_at = now())  FK-parent
 *   question_comments     → soft-delete (deleted_at = now())  FK-parent
 *   user_consents         → HARD delete  (append-only, no deleted_at column)
 *   users                 → restore deleted_at = null  (seed users kept active)
 *
 * NOTE: the `users` set is only populated by audit-auth-events callers.
 * The rpc-cross-tenant BE test keeps its own inline try/finally user-restore
 * and does NOT route through this tracker.
 */

import type { getAdminClient } from '../../helpers/supabase'

type AdminClient = ReturnType<typeof getAdminClient>

export type FixtureTracker = {
  sessions: Set<string>
  codes: Set<string>
  comments: Set<string>
  /** composite "studentId::questionId" keys (flagged_questions PK is the pair) */
  flags: Set<string>
  consents: Set<string>
  /** user ids that were soft-deleted during the test and need deleted_at=null restored */
  users: Set<string>
}

/**
 * Create a fresh FixtureTracker with empty Sets for every tracked table.
 */
export function createFixtureTracker(): FixtureTracker {
  return {
    sessions: new Set<string>(),
    codes: new Set<string>(),
    comments: new Set<string>(),
    flags: new Set<string>(),
    consents: new Set<string>(),
    users: new Set<string>(),
  }
}

/**
 * Clean up all fixture rows tracked in `tracker` via the given admin client.
 *
 * Each table block runs in its own try/catch so a failure in one never skips
 * the rest. Errors are accumulated and re-thrown as a single aggregated error
 * at the end. IDs are cleared in `finally` so a failed delete can't replay a
 * stale id on the next call.
 */
export async function cleanupFixtures(admin: AdminClient, tracker: FixtureTracker): Promise<void> {
  const errors: string[] = []
  const now = new Date().toISOString()

  // ── quiz_sessions → soft-delete ───────────────────────────────────────────
  if (tracker.sessions.size > 0) {
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: now })
        .in('id', Array.from(tracker.sessions))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`cleanupFixtures quiz_sessions: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] soft-deleted ${data?.length} quiz_session(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.sessions.clear()
    }
  }

  // ── internal_exam_codes → soft-delete ─────────────────────────────────────
  if (tracker.codes.size > 0) {
    try {
      const { data, error } = await admin
        .from('internal_exam_codes')
        .update({ deleted_at: now })
        .in('id', Array.from(tracker.codes))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`cleanupFixtures internal_exam_codes: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] soft-deleted ${data?.length} internal_exam_code(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.codes.clear()
    }
  }

  // ── flagged_questions → soft-delete ───────────────────────────────────────
  // flagged_questions PK is (student_id, question_id). The `flags` set stores
  // composite "studentId::questionId" keys so cleanup stays scoped to the
  // seeding student and never touches another user's flag on the same question
  // (mirrors the original per-row `.eq('student_id', …).eq('question_id', …)`).
  if (tracker.flags.size > 0) {
    try {
      let deleted = 0
      for (const key of tracker.flags) {
        const [studentId, questionId] = key.split('::')
        if (!studentId || !questionId) {
          throw new Error(
            `cleanupFixtures flagged_questions: malformed key "${key}" (expected "studentId::questionId")`,
          )
        }
        const { data, error } = await admin
          .from('flagged_questions')
          .update({ deleted_at: now })
          .eq('student_id', studentId)
          .eq('question_id', questionId)
          .is('deleted_at', null)
          .select('question_id')
        if (error) throw new Error(`cleanupFixtures flagged_questions: ${error.message}`)
        deleted += data?.length ?? 0
      }
      if (deleted > 0) {
        console.log(`[cleanup] soft-deleted ${deleted} flagged_question(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.flags.clear()
    }
  }

  // ── question_comments → soft-delete ───────────────────────────────────────
  if (tracker.comments.size > 0) {
    try {
      const { data, error } = await admin
        .from('question_comments')
        .update({ deleted_at: now })
        .in('id', Array.from(tracker.comments))
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`cleanupFixtures question_comments: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] soft-deleted ${data?.length} question_comment(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.comments.clear()
    }
  }

  // ── user_consents → HARD delete (append-only, no deleted_at column) ───────
  if (tracker.consents.size > 0) {
    try {
      const { data, error } = await admin
        .from('user_consents')
        .delete()
        .in('id', Array.from(tracker.consents))
        .select('id')
      if (error) throw new Error(`cleanupFixtures user_consents: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] hard-deleted ${data?.length} user_consent(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.consents.clear()
    }
  }

  // ── users → restore deleted_at = null (only populated by audit-auth-events) ─
  if (tracker.users.size > 0) {
    try {
      const { data, error } = await admin
        .from('users')
        .update({ deleted_at: null })
        .in('id', Array.from(tracker.users))
        .not('deleted_at', 'is', null)
        .select('id')
      if (error) throw new Error(`cleanupFixtures users restore: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[cleanup] restored ${data?.length} soft-deleted user(s)`)
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      tracker.users.clear()
    }
  }

  if (errors.length > 0) {
    throw new Error(`cleanupFixtures: ${errors.join('; ')}`)
  }
}
