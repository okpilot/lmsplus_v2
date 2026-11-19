// Integration-only infra (no unit test, as fixtures.ts): shared by app-layer integration tests and e2e seeding.
import type { SupabaseClient } from '@supabase/supabase-js'

/** A finished, passed internal-exam session with a score for a student and subject (service role, no code). */
export async function insertPassedSession(
  admin: SupabaseClient,
  c: { orgId: string; userId: string; subjectId: string; score: number; endedAt: Date },
): Promise<string> {
  const res = await admin
    .from('quiz_sessions')
    .insert({
      organization_id: c.orgId,
      student_id: c.userId,
      mode: 'internal_exam',
      subject_id: c.subjectId,
      config: { pass_mark: 75, question_ids: [] },
      total_questions: 0,
      started_at: new Date(c.endedAt.getTime() - 1_800_000).toISOString(),
      ended_at: c.endedAt.toISOString(),
      passed: true,
      score_percentage: c.score,
    })
    .select('id')
    .single()
  if (res.error || !res.data)
    throw new Error(`insertPassedSession: ${res.error?.message ?? 'no row'}`)
  return res.data.id
}
