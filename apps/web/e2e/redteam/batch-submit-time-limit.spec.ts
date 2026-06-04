/**
 * Red Team Spec — Vector AI (MEDIUM): batch_submit_quiz server-side time-limit
 *
 * Attack: submit an exam after its deadline has passed, relying on a tampered or
 * absent client timer to sneak answers in past expiry.
 * Defense: batch_submit_quiz independently enforces
 *   now() > started_at + (time_limit_seconds + 30s grace)
 * and, when breached, force-ends the session with a zeroed result
 * (`expired: true`, score 0, no answers scored) regardless of the payload.
 *
 * The check (mig 20260601000001, lines 99-125) fires AFTER auth/ownership but
 * BEFORE answer/config validation, so an overdue submission is zeroed no matter
 * what answers are sent. The branch is reachable only for exam-mode sessions —
 * quick_quiz leaves `time_limit_seconds` NULL, so this spec seeds a mock_exam
 * session directly (admin client) with a backdated started_at, mirroring the
 * rpc-complete-overdue-exam.spec.ts seed pattern.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Red Team: batch_submit_quiz time-limit enforcement', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let orgId: string
  let subjectId: string
  let questionId: string
  let answers: { question_id: string; selected_option: string; response_time_ms: number }[]

  const createdSessionIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId

    const { data: q, error: qErr } = await admin
      .from('questions')
      .select('id, options')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
      .single()
    if (qErr || !q) throw new Error(`time-limit seed: no active question found: ${qErr?.message}`)
    questionId = q.id
    // options is JSONB — narrow to an array before indexing (code-style.md §5).
    const opts = Array.isArray(q.options) ? (q.options as { id: string }[]) : []
    const firstOption = opts[0]?.id
    if (!firstOption) throw new Error('time-limit seed: question has no options to answer with')
    answers = [{ question_id: questionId, selected_option: firstOption, response_time_ms: 2000 }]
  })

  // Seed an attacker-owned mock_exam session with a 60s limit. `overdue` backdates
  // started_at past the 60s + 30s grace window; otherwise it is well within it.
  const seedExamSession = async (overdue: boolean): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode: 'mock_exam',
        subject_id: subjectId,
        config: { question_ids: [questionId], pass_mark: 75 },
        total_questions: 1,
        time_limit_seconds: 60,
        started_at: new Date(Date.now() - (overdue ? 120_000 : 5_000)).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed exam session: ${error?.message}`)
    createdSessionIds.add(data.id)
    return data.id
  }

  test.afterEach(async () => {
    if (createdSessionIds.size === 0) return
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', Array.from(createdSessionIds))
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error('[batch-time-limit afterEach] soft-delete failed:', error.message)
        throw new Error(`afterEach soft-delete: ${error.message}`)
      }
      if ((data?.length ?? 0) > 0) {
        console.log(`[batch-time-limit] soft-deleted ${data?.length} session(s)`)
      }
    } finally {
      createdSessionIds.clear()
    }
  })

  test('AI: an overdue exam submission is force-expired and scored zero (server-enforced deadline)', async () => {
    const sid = await seedExamSession(true)

    const { data, error } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sid,
      p_answers: answers,
    })

    // The RPC does not raise — it returns a zeroed, expired result.
    expect(error).toBeNull()
    const d = data as {
      expired?: boolean
      answered_count?: number
      correct_count?: number
      score_percentage?: number
      passed?: boolean
      results?: unknown[]
    }
    // `expired: true` is emitted ONLY by the past-grace branch — asserting it pins
    // that the deadline check (not some other rejection) is what zeroed the score.
    expect(d?.expired).toBe(true)
    expect(d?.answered_count).toBe(0)
    expect(d?.correct_count).toBe(0)
    expect(d?.score_percentage).toBe(0)
    expect(d?.passed).toBe(false)
    expect(Array.isArray(d?.results) ? d?.results?.length : -1).toBe(0)

    // Server force-ended the session despite the in-time-looking payload.
    const { data: row, error: rowErr } = await admin
      .from('quiz_sessions')
      .select('ended_at, score_percentage')
      .eq('id', sid)
      .single()
    expect(rowErr).toBeNull()
    expect(row?.ended_at).not.toBeNull()
    // score_percentage is NUMERIC(5,2): PostgREST serializes fractional NUMERIC as a
    // string (code-style.md §5). Coerce so a future non-integer score can't slip past;
    // `?? -1` keeps a NULL from masquerading as 0.
    expect(Number(row?.score_percentage ?? -1)).toEqual(0)

    // No answers were recorded — the submission was rejected at the deadline gate
    // before any scoring/insert.
    const { count, error: countErr } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sid)
    expect(countErr).toBeNull()
    expect(count).toBe(0)
  })

  test('AI control: an in-time exam submission scores normally (proves expiry is the cause)', async () => {
    // Non-vacuity: the same payload on a non-overdue session is actually scored,
    // so the overdue test above zeroes BECAUSE of the deadline, not because the
    // session/answer shape is universally rejected.
    const sid = await seedExamSession(false)

    const { data, error } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sid,
      p_answers: answers,
    })

    expect(error).toBeNull()
    const d = data as { expired?: boolean; answered_count?: number; total_questions?: number }
    expect(d?.expired).toBeUndefined()
    expect(d?.answered_count).toBe(1)
    expect(d?.total_questions).toBe(1)

    const { count, error: countErr } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sid)
    expect(countErr).toBeNull()
    expect(count).toBe(1)
  })
})
