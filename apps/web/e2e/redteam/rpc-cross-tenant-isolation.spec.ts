/**
 * Red Team Spec: Cross-Tenant RPC Isolation
 *
 * Vector D (MEDIUM): A user from a different organization attempts to start a quiz
 * session using a subject that belongs to egmont-aviation. RLS should prevent
 * cross-tenant data access at both the RPC and direct SELECT level.
 *
 * This file covers the 14 cross-tenant isolation tests. The describe-level
 * beforeAll seeds the minimal egmont victim fixtures (responses via
 * seedVictimResponses + one quiz_session) needed to keep the direct-read
 * isolation assertions NON-VACUOUS (#818, code-style.md §7): an empty cross-org
 * result only proves isolation if a victim row provably exists to be blocked.
 * The broader report-RPC seeders live in rpc-cross-tenant-reports.spec.ts.
 *
 * Status: Expected to PASS (defenses should hold).
 * If any assertion fails, it indicates an RLS gap requiring immediate fix.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  createCrossOrgUser,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedCrossOrgAdmin,
  seedRedTeamUsers,
  seedVictimResponses,
} from './helpers/seed'

test.describe('Red Team: Cross-Tenant RPC Isolation', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  // The cross-org caller's own org id — used by Vector DN2 to prove that org has
  // NO exam_config for examSubjectId (so the rejection is org-scoping, not a
  // config that happens to exist for the attacker's org).
  let crossOrgUserOrgId = ''
  // A genuine is_admin() user in redteam-other-org — used by Vector DX to prove
  // admin_update_questions RLS blocks a cross-tenant write even for a real admin.
  let crossOrgAdminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontSubjectId: string
  let egmontTopicId: string
  let egmontQuestionIds: string[]
  let egmontOrgId: string
  // The egmont victim user (seeded by seedRedTeamUsers/seedVictimResponses) and a
  // victim-owned quiz_session — used by the direct-read isolation tests (#818) to
  // prove a real victim row exists before asserting the cross-org caller sees 0.
  let victimUserId = ''
  let seededVictimSessionId: string | null = null
  // A subject GUARANTEED to have egmont questions + an enabled exam_config, so
  // the cross-org exam/pool probes below prove org-scoping rather than the
  // vacuous "this subject has no data anywhere" case.
  let examSubjectId: string
  let examTopicId: string
  let examConfigId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontOrgId = seed.orgId
    victimUserId = seed.victimUserId
    const crossOrgUser = await createCrossOrgUser()
    crossOrgUserOrgId = crossOrgUser.orgId
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    // Vector DX: a real admin in the OTHER org, to prove the cross-org write is
    // blocked by org-scoping (not merely by lack of the admin role).
    const crossOrgAdmin = await seedCrossOrgAdmin()
    crossOrgAdminClient = await createAuthenticatedClient(
      crossOrgAdmin.email,
      crossOrgAdmin.password,
    )
    adminClient = getAdminClient()

    // Seed the egmont victim with 8 correct responses so that the cross-org
    // RPC assertions prove isolation (empty/zeroed) rather than absence of data.
    await seedVictimResponses()

    // Resolve an egmont subject that definitely has active questions, and ensure
    // an enabled exam_config (+ distribution row) exists for it — the cross-org
    // AH/CB/AK probes assert the attacker is blocked from THIS populated subject.
    const examPick = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    examSubjectId = examPick.subjectId
    examTopicId = examPick.topicId
    examConfigId = await ensureExamConfig(egmontOrgId, examSubjectId, examTopicId)

    // Reuse that same guaranteed-populated subject for the egmont quick-quiz
    // probes (start_quiz_session, direct SELECT). Deriving from
    // pickSubjectWithQuestions — instead of an arbitrary first easa_subjects row
    // that may have no active questions — keeps egmontQuestionIds non-empty so the
    // cross-org isolation proofs stay non-vacuous.
    egmontSubjectId = examSubjectId
    egmontTopicId = examTopicId

    // Scope to examTopicId too: start_quiz_session validates question_ids against
    // (organization_id = caller's org) AND (topic_id = p_topic_id). Pinning the
    // payload to examTopicId means a legitimate egmont student WOULD pass that
    // check, so the cross-org caller below is rejected solely by org-scoping —
    // not by an incidental topic mismatch.
    const { data: qs, error: qErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', egmontOrgId)
      .eq('subject_id', examSubjectId)
      .eq('topic_id', examTopicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5)
    expect(qErr).toBeNull()
    egmontQuestionIds = (qs ?? []).map((q) => q.id)
    expect(egmontQuestionIds.length).toBeGreaterThan(0)

    // Seed one completed quiz_session owned by the egmont victim (#818). The
    // direct-read isolation test for quiz_sessions needs a real victim row to
    // exist so the cross-org "0 rows" assertion is non-vacuous (§7). Soft-deleted
    // in afterAll. config has no pass_mark — quick_quiz never reads it.
    const nowMs = Date.now()
    const { data: sessionRow, error: sessionErr } = await adminClient
      .from('quiz_sessions')
      .insert({
        organization_id: egmontOrgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        subject_id: examSubjectId,
        config: { question_ids: [] },
        total_questions: 1,
        started_at: new Date(nowMs - 20 * 60 * 1000).toISOString(),
        ended_at: new Date(nowMs - 10 * 60 * 1000).toISOString(),
        score_percentage: 100,
        passed: true,
        correct_count: 1,
      })
      .select('id')
      .single()
    if (sessionErr || !sessionRow)
      throw new Error(`#818 seed victim session: ${sessionErr?.message}`)
    seededVictimSessionId = sessionRow.id
  })

  test.afterAll(async () => {
    // Hermetic cleanup (§7): soft-delete the seeded victim quiz_session. The
    // seeded student_responses are immutable (append-only, no cleanup) and the
    // egmont questions are shared seed data — neither is touched here.
    if (!seededVictimSessionId) return
    const { data: discarded, error } = await adminClient
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', seededVictimSessionId)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      console.error(`[cross-tenant-isolation cleanup] soft-delete error: ${error.message}`)
    } else if ((discarded?.length ?? 0) > 0) {
      console.log(
        `[cross-tenant-isolation cleanup] soft-deleted ${discarded?.length} victim session(s)`,
      )
    }
  })

  test('cross-org user cannot start a quiz session for an egmont-aviation subject', async () => {
    // Attack: submit a payload that is fully valid for a legitimate egmont
    // student — real egmont (subject, topic, question_ids). start_quiz_session
    // scopes question validation to the CALLER's org, so for the cross-org
    // caller every question fails `q.organization_id = v_org_id` and the RPC
    // raises `invalid_question_ids`. The payload's same-org/same-topic validity
    // is what makes this prove org-scoping rather than a topic mismatch.
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: egmontSubjectId,
      p_topic_id: egmontTopicId,
      p_question_ids: egmontQuestionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/invalid_question_ids/i)
    expect(data ?? null).toBeNull()
  })

  test('cross-org user cannot SELECT a known egmont question via anon client', async () => {
    // Non-vacuous (#818, §7): a specific egmont question provably exists (admin
    // re-read), so the cross-org caller's 0-row result for THAT id proves
    // tenant_isolation RLS blocked it — not an empty first page.
    const victimQid = egmontQuestionIds[0]
    const { data: adminQ, error: adminErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('id', victimQid)
      .single()
    expect(adminErr).toBeNull()
    expect(adminQ).not.toBeNull()

    const { data, error } = await crossOrgClient.from('questions').select('id').eq('id', victimQid)
    expect(error).toBeNull() // RLS returns empty, not an error
    expect(data?.length ?? 0).toBe(0)
  })

  test('cross-org user cannot read the egmont victim quiz_session', async () => {
    // Non-vacuous (#818, §7): a victim-owned quiz_session was seeded in beforeAll
    // and provably exists (admin re-read). The cross-org caller probing by the
    // victim's student_id must see 0 rows — quiz_sessions SELECT RLS scopes to
    // student_id = auth.uid(), so the attacker is blocked despite the row existing.
    expect(seededVictimSessionId).not.toBeNull()
    const { data: adminRows, error: adminErr } = await adminClient
      .from('quiz_sessions')
      .select('id')
      .eq('id', seededVictimSessionId)
      .is('deleted_at', null)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    const { data, error } = await crossOrgClient
      .from('quiz_sessions')
      .select('id')
      .eq('student_id', victimUserId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  test('cross-org user cannot read the egmont victim student_responses', async () => {
    // Non-vacuous (#818, §7): seedVictimResponses seeded 8 responses for the egmont
    // victim, which provably exist (admin re-read). The cross-org caller probing by
    // the victim's student_id must see 0 — student_responses SELECT RLS scopes to
    // student_id = auth.uid(), blocking the attacker despite the rows existing.
    const { data: adminRows, error: adminErr } = await adminClient
      .from('student_responses')
      .select('id')
      .eq('student_id', victimUserId)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    const { data, error } = await crossOrgClient
      .from('student_responses')
      .select('id')
      .eq('student_id', victimUserId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  // -------------------------------------------------------------------------
  // #673 — Aggregation RPC cross-org isolation (four vectors, issue #668 RPC layer)
  // -------------------------------------------------------------------------

  test('cross-org student sees no egmont questions or correct counts from get_student_mastery_stats', async () => {
    // get_student_mastery_stats builds its denominator from questions visible to
    // the caller via tenant_isolation RLS, and self-scopes the correct-answer
    // numerator to auth.uid(). The cross-org caller's org has no questions, so the
    // result must be EMPTY — proving no egmont question (denominator) leaks across
    // tenants. The every(correct===0) guard additionally documents that no egmont
    // victim correct-count could appear. (The non-vacuous numerator self-scope
    // proof lives in dashboard-stats-rpc-isolation.spec.ts BW3, where the egmont
    // instructor's denominator IS populated.)
    const { data, error } = await crossOrgClient.rpc('get_student_mastery_stats')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    expect((data ?? []).every((r: { correct: number }) => r.correct === 0)).toBe(true)
  })

  test('cross-org student sees no egmont question counts from get_question_counts', async () => {
    // get_question_counts is org-scoped via RLS on questions.
    // redteam-other-org has no seeded questions, so a non-empty result would
    // indicate an egmont question count leaked to another tenant.
    const { data, error } = await crossOrgClient.rpc('get_question_counts', {
      p_status: 'active',
    })
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('cross-org student sees no practice history from egmont victim in get_student_last_practiced', async () => {
    // get_student_last_practiced is self-scoped to auth.uid(); the cross-org
    // caller has zero responses, so the result must be empty. Any row would
    // mean the egmont victim's last-practiced timestamps leaked.
    const { data, error } = await crossOrgClient.rpc('get_student_last_practiced')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('cross-org student sees zero streak counts from get_student_streak', async () => {
    // get_student_streak always returns exactly one row {current_streak, best_streak}.
    // A cross-org caller with no responses must see {0, 0}. Non-zero values
    // would indicate the egmont victim's streak data leaked across orgs.
    const { data, error } = await crossOrgClient.rpc('get_student_streak')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.current_streak).toBe(0)
    expect(data?.[0]?.best_streak).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Cross-org exam / question-pool / distribution isolation (#545, #690, #517)
  // -------------------------------------------------------------------------

  test('cross-org student cannot start an exam for an egmont subject (Vector AH, #545)', async () => {
    // egmont HAS an enabled exam_config for examSubjectId (seeded in beforeAll);
    // the attacker's org does NOT. start_exam_session scopes the exam_configs
    // lookup to the caller's org, so the cross-org caller hits v_config_id IS NULL
    // → RAISE 'no exam configuration found for this subject'. The egmont config
    // existing is what makes this prove org-scoping, not global absence.
    const { data, error } = await crossOrgClient.rpc('start_exam_session', {
      p_subject_id: examSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/no exam configuration found/i)
    expect(data ?? null).toBeNull()
  })

  test('Vector DN2 (#825): cross-org student cannot start a vfr_rt exam for an egmont subject', async () => {
    // start_vfr_rt_exam_session (mig 099) scopes its exam_configs lookup to the
    // CALLER's org (ec.organization_id = caller_org) with no vfr-specific flag,
    // so the enabled egmont config seeded in beforeAll satisfies it for an egmont
    // student but not for the cross-org caller → RAISE 'exam_config_required'.
    // Non-vacuity (§7): assert egmont HAS the config AND the attacker's own org
    // does NOT — so the rejection proves org-scoping, not a globally-absent or
    // attacker-present config.
    const { data: egmontConfig, error: egmontCfgErr } = await adminClient
      .from('exam_configs')
      .select('id')
      .eq('id', examConfigId)
      .eq('enabled', true)
      .is('deleted_at', null)
      .single()
    expect(egmontCfgErr).toBeNull()
    expect(egmontConfig).not.toBeNull()

    const { data: crossOrgConfig, error: crossCfgErr } = await adminClient
      .from('exam_configs')
      .select('id')
      .eq('organization_id', crossOrgUserOrgId)
      .eq('subject_id', examSubjectId)
      .eq('enabled', true)
      .is('deleted_at', null)
      .maybeSingle()
    expect(crossCfgErr).toBeNull()
    expect(crossOrgConfig).toBeNull()

    const { data, error } = await crossOrgClient.rpc('start_vfr_rt_exam_session', {
      p_subject_id: examSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/exam_config_required/i)
    expect(data ?? null).toBeNull()
  })

  test('cross-org student sees no egmont questions from get_random_question_ids (Vector CB, #690)', async () => {
    // Non-vacuity: examSubjectId has active egmont questions (pickSubjectWithQuestions
    // guarantees it). get_random_question_ids is SECURITY INVOKER → tenant_isolation
    // RLS on questions filters to the attacker's org, which has none for this subject.
    expect(egmontQuestionIds.length).toBeGreaterThan(0)
    const { data, error } = await crossOrgClient.rpc('get_random_question_ids', {
      p_subject_id: examSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 10,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('cross-org student sees no egmont counts from get_filtered_question_counts (Vector CB, #690)', async () => {
    // Same tenant_isolation defense as get_random_question_ids — the cross-org
    // caller enumerates no per-topic counts for an egmont subject.
    const { data, error } = await crossOrgClient.rpc('get_filtered_question_counts', {
      p_subject_id: examSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('cross-org student cannot read exam_config_distributions (Vector AK, #517)', async () => {
    // exam_config_distributions has an admin-only SELECT policy (is_admin() AND
    // same org) and NO student policy — so a non-admin cross-org student sees
    // none of egmont's rows. Non-vacuity: admin confirms the egmont config has
    // ≥1 distribution row, then the cross-org student SELECT for THAT SAME
    // config returns 0 (RLS blocks at the role boundary).
    const { data: adminRows, error: adminErr } = await adminClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', examConfigId)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    const { data, error } = await crossOrgClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', examConfigId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Vector CL2 (#784): get_session_reports auth-passed control
  // -------------------------------------------------------------------------

  test('CL2 (#784): authenticated cross-org user with no completed sessions gets an empty get_session_reports result', async () => {
    // Auth-passed control: get_session_reports clears the auth.uid() null-check
    // (the caller is authenticated, so it does NOT raise 'Not authenticated'),
    // but the cross-org user has no completed quiz_sessions. The self-scoped
    // query (WHERE qs.student_id = auth.uid() AND ended_at IS NOT NULL) returns
    // zero rows → error null, empty array. This is the no-rows baseline; CL3
    // (in rpc-cross-tenant-reports.spec.ts) is the true non-vacuous ownership proof.
    const { data, error } = await crossOrgClient.rpc('get_session_reports', {})
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Vector DX (#851): cross-org admin cannot flip has_calculations (#837)
  // -------------------------------------------------------------------------

  test('Vector DX (#851): cross-org admin cannot flip has_calculations on a question owned by another org', async () => {
    // bulkUpdateCalculations (apps/web/app/app/admin/questions/actions/
    // bulk-update-calculations.ts) runs purely under the CALLER's RLS — no
    // service-role — via:
    //   questions.update({ has_calculations, updated_at })
    //           .in('id', ids).is('deleted_at', null).select('id')
    // admin_update_questions RLS (mig 20260324000054) gates UPDATE on
    // is_admin() AND organization_id = caller_org; the base tenant_isolation
    // policy is also org-scoped. A cross-org admin matches 0 rows → the action
    // returns { success: false, error: 'No questions were updated' }.
    // Server Actions aren't callable from a PostgREST-layer red-team spec, so
    // reproducing the exact chain via the cross-org admin client exercises the
    // identical RLS boundary the action depends on.
    //
    // Vector allocated DX (not the issue's speculative "DZ"): the live
    // attack-surface matrix max on master is DW (agent-red-team.md allocation
    // rule — highest+1, never trust an externally-computed ID).
    const targetId = egmontQuestionIds[0]

    // Non-vacuity (code-style.md §7): the protected row genuinely exists; capture
    // its real value so "unchanged" is a meaningful assertion, not a vacuous one.
    const { data: before, error: beforeErr } = await adminClient
      .from('questions')
      .select('id, has_calculations')
      .eq('id', targetId)
      .single()
    expect(beforeErr).toBeNull()
    expect(before).not.toBeNull()
    // Runtime-guard the cast (§5): has_calculations is BOOLEAN NOT NULL, so a
    // non-boolean here would make the "unchanged" assertion below vacuous
    // (toBe(undefined)). The typeof check fails loudly instead.
    expect(typeof before?.has_calculations).toBe('boolean')
    const original = before?.has_calculations as boolean

    // Attack: cross-org admin attempts to flip the flag to the opposite value.
    const { data: updated, error: updateErr } = await crossOrgAdminClient
      .from('questions')
      .update({ has_calculations: !original, updated_at: new Date().toISOString() })
      .in('id', [targetId])
      .is('deleted_at', null)
      .select('id')

    // RLS USING mismatch → silent 0-row no-op: error null, data []. (An UPDATE
    // USING failure is NOT a 42501 — that is the INSERT/UPDATE WITH CHECK path.)
    // This is the action's 'No questions were updated' branch.
    expect(updateErr).toBeNull()
    expect(updated ?? []).toHaveLength(0)

    // Confirm the egmont question is untouched.
    const { data: after, error: afterErr } = await adminClient
      .from('questions')
      .select('has_calculations')
      .eq('id', targetId)
      .single()
    expect(afterErr).toBeNull()
    expect(after?.has_calculations).toBe(original)
  })
})
