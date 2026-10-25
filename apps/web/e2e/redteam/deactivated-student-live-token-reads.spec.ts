/**
 * Red Team Spec — Vectors JU, JV (#1607, mig 20261025000100): a deactivated student (Auth ban +
 * users.deleted_at, as toggle-student-status does it) replays a pre-ban access token at PostgREST.
 *
 *   JU  direct SELECT on every `<table>_select_active_caller` table (own rows, plain and
 *       HEAD count=exact) returns 0 rows / count 0.
 *   JV  SECURITY INVOKER readers return no student-derived data: get_discovery_counts → [],
 *       get_student_streak → {0,0}, get_student_profile_stats → 0 sessions.
 *
 * CONTROL: the same token, before the ban and after the restore, reads >=1 own row per table and
 * non-zero RPC output.
 *
 * Hermetic (code-style.md §7): dedicated throwaway student (E2E_REDTEAM_JU_STUDENT_EMAIL).
 * quiz_sessions / flagged_questions soft-deleted; quiz_drafts, quiz_session_progress, fsrs_cards
 * removed by delete (no deleted_at column / hard-delete by design). student_responses,
 * quiz_session_answers, audit_events, user_consents are append-only: one row per run, left.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, upsertUser } from './helpers/seed-core'
import {
  E2E_REDTEAM_JU_MARKER,
  E2E_REDTEAM_JU_STUDENT_EMAIL,
  E2E_REDTEAM_JU_STUDENT_PASSWORD,
} from './helpers/seed-markers'

const BAN = '876000h'

const OWNED = [
  ['quiz_sessions', 'student_id'],
  ['student_responses', 'student_id'],
  ['quiz_session_answers', 'session_id'],
  ['quiz_session_progress', 'student_id'],
  ['quiz_drafts', 'student_id'],
  ['flagged_questions', 'student_id'],
  ['fsrs_cards', 'student_id'],
  ['user_consents', 'user_id'],
  ['audit_events', 'actor_id'],
] as const

type Admin = ReturnType<typeof getAdminClient>
type Result = { error: { message: string } | null }

test.describe('Red Team: deactivated student live-token reads (JU, JV)', () => {
  test.setTimeout(120_000)

  let admin: Admin
  let orgId: string
  let studentId: string
  let qId: string
  let deactivated = false

  const ok = async (label: string, p: PromiseLike<Result>) => {
    const { error } = await p
    if (error) throw new Error(`${label}: ${error.message}`)
  }

  const setDeactivated = async (on: boolean) => {
    if (on) deactivated = true
    const errors: string[] = []
    const ban = await admin.auth.admin.updateUserById(studentId, {
      ban_duration: on ? BAN : 'none',
    })
    if (ban.error) errors.push(`ban(${on}): ${ban.error.message}`)
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: on ? new Date().toISOString() : null })
      .eq('id', studentId)
      .select('id')
    if (error) errors.push(`users.deleted_at(${on}): ${error.message}`)
    else if ((data?.length ?? 0) === 0) errors.push(`users.deleted_at(${on}): 0 rows`)
    if (errors.length > 0) throw new Error(errors.join('; '))
    if (!on) deactivated = false
  }

  const seed = async (sid: string) => {
    const ended = new Date().toISOString()
    await ok(
      'session finish',
      admin
        .from('quiz_sessions')
        .update({ ended_at: ended, score_percentage: 100, correct_count: 1 })
        .eq('id', sid),
    )
    await ok(
      'student_responses',
      admin.from('student_responses').insert({
        organization_id: orgId,
        student_id: studentId,
        question_id: qId,
        session_id: sid,
        selected_option_id: 'a',
        is_correct: true,
        response_time_ms: 1000,
      }),
    )
    await ok(
      'quiz_session_answers',
      admin.from('quiz_session_answers').insert({
        session_id: sid,
        question_id: qId,
        selected_option_id: 'a',
        is_correct: true,
        response_time_ms: 1000,
      }),
    )
    await ok(
      'quiz_session_progress',
      admin
        .from('quiz_session_progress')
        .insert({ session_id: sid, question_id: qId, student_id: studentId }),
    )
    await ok(
      'quiz_drafts',
      admin.from('quiz_drafts').insert({
        student_id: studentId,
        organization_id: orgId,
        question_ids: [qId],
        session_config: { e2e_marker: E2E_REDTEAM_JU_MARKER },
      }),
    )
    await ok(
      'flagged_questions',
      admin
        .from('flagged_questions')
        .upsert({ student_id: studentId, question_id: qId, deleted_at: null }),
    )
    await ok(
      'fsrs_cards',
      admin
        .from('fsrs_cards')
        .upsert(
          { student_id: studentId, question_id: qId },
          { onConflict: 'student_id,question_id' },
        ),
    )
    const consent = await admin
      .from('user_consents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .eq('document_version', E2E_REDTEAM_JU_MARKER)
    if (consent.error) throw new Error(`consent probe: ${consent.error.message}`)
    if ((consent.count ?? 0) === 0)
      await ok(
        'user_consents',
        admin.from('user_consents').insert({
          user_id: studentId,
          document_type: 'terms_of_service',
          document_version: E2E_REDTEAM_JU_MARKER,
          accepted: true,
        }),
      )
    await ok(
      'audit_events',
      admin.from('audit_events').insert({
        organization_id: orgId,
        actor_id: studentId,
        actor_role: 'student',
        event_type: 'student.login',
        resource_type: 'session',
        metadata: { e2e_marker: E2E_REDTEAM_JU_MARKER },
      }),
    )
  }

  /** Own-row counts per table, plain SELECT and HEAD count=exact, as the given client. */
  const readAll = async (client: SupabaseClient, sid: string) => {
    const out: Record<string, { rows: number; count: number }> = {}
    for (const [table, col] of OWNED) {
      const key = col === 'session_id' ? sid : studentId
      const plain = await client.from(table).select('*').eq(col, key)
      expect(plain.error, `${table} select`).toBeNull()
      const head = await client.from(table).select('*', { count: 'exact', head: true }).eq(col, key)
      expect(head.error, `${table} head`).toBeNull()
      out[table] = { rows: plain.data?.length ?? 0, count: head.count ?? -1 }
    }
    return out
  }

  const readRpcs = async (client: SupabaseClient) => {
    const dc = await client.rpc('get_discovery_counts')
    expect(dc.error).toBeNull()
    const streak = await client.rpc('get_student_streak')
    expect(streak.error).toBeNull()
    const profile = await client.rpc('get_student_profile_stats')
    expect(profile.error).toBeNull()
    const dcRows = (dc.data ?? []) as Array<{
      n_flagged: number | string
      n_unseen: number | string
      n_all: number | string
    }>
    const s = ((streak.data ?? []) as Array<{ best_streak: number }>)[0]
    const p = ((profile.data ?? []) as Array<{ total_sessions: number | string }>)[0]
    return {
      dcRows: dcRows.length,
      dcFlagged: dcRows.reduce((n, r) => n + Number(r.n_flagged), 0),
      dcSeen: dcRows.reduce((n, r) => n + Number(r.n_all) - Number(r.n_unseen), 0),
      bestStreak: s?.best_streak ?? -1,
      totalSessions: Number(p?.total_sessions ?? -1),
    }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    orgId = await getEgmontOrgId(admin)
    studentId = await upsertUser(
      admin,
      E2E_REDTEAM_JU_STUDENT_EMAIL,
      E2E_REDTEAM_JU_STUDENT_PASSWORD,
      orgId,
    )
    // A prior aborted run may have left the student deactivated.
    await setDeactivated(false)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .eq('question_type', 'multiple_choice')
      .is('deleted_at', null)
      .order('id')
      .limit(1)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    const id = data?.[0]?.id
    if (typeof id !== 'string') throw new Error('need 1 active MC question')
    qId = id
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const step = async (label: string, fn: () => PromiseLike<Result>) => {
      try {
        const { error } = await fn()
        if (error) errors.push(`${label}: ${error.message}`)
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (deactivated)
      await step('restore', async () => {
        await setDeactivated(false)
        return { error: null }
      })
    await step('progress (no deleted_at column)', () =>
      admin.from('quiz_session_progress').delete().eq('student_id', studentId),
    )
    await step('fsrs_cards (no deleted_at column)', () =>
      admin.from('fsrs_cards').delete().eq('student_id', studentId).eq('question_id', qId),
    )
    await step('drafts (hard-delete by design, docs/database.md)', () =>
      admin.from('quiz_drafts').delete().eq('session_config->>e2e_marker', E2E_REDTEAM_JU_MARKER),
    )
    await step('flags', () =>
      admin
        .from('flagged_questions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', studentId)
        .is('deleted_at', null),
    )
    await step('sessions', () =>
      admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_JU_MARKER)
        .is('deleted_at', null),
    )
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('JU/JV: a banned, soft-deleted student with a live token reads no own rows', async () => {
    const client = await createAuthenticatedClient(
      E2E_REDTEAM_JU_STUDENT_EMAIL,
      E2E_REDTEAM_JU_STUDENT_PASSWORD,
    )
    const { data: s, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        total_questions: 1,
        config: { question_ids: [qId], e2e_marker: E2E_REDTEAM_JU_MARKER },
      })
      .select('id')
      .single()
    if (error || typeof s?.id !== 'string') throw new Error(`seed session: ${error?.message}`)
    await seed(s.id)

    // CONTROL (before): every table yields own rows; RPCs see student data.
    const before = await readAll(client, s.id)
    for (const [table] of OWNED) {
      expect(before[table]?.rows, `${table} active rows`).toBeGreaterThanOrEqual(1)
      expect(before[table]?.count, `${table} active count`).toBeGreaterThanOrEqual(1)
    }
    const rpcBefore = await readRpcs(client)
    expect(rpcBefore.dcFlagged).toBeGreaterThanOrEqual(1)
    expect(rpcBefore.dcSeen).toBeGreaterThanOrEqual(1)
    expect(rpcBefore.bestStreak).toBeGreaterThanOrEqual(1)
    expect(rpcBefore.totalSessions).toBeGreaterThanOrEqual(1)

    // ATTACK: same token after ban + soft-delete.
    await setDeactivated(true)
    const during = await readAll(client, s.id)
    for (const [table] of OWNED) {
      expect(during[table], `${table} deactivated`).toEqual({ rows: 0, count: 0 })
    }
    const rpcDuring = await readRpcs(client)
    expect(rpcDuring).toEqual({
      dcRows: 0,
      dcFlagged: 0,
      dcSeen: 0,
      bestStreak: 0,
      totalSessions: 0,
    })

    // CONTROL (after): restore → same token reads again.
    await setDeactivated(false)
    const after = await readAll(client, s.id)
    for (const [table] of OWNED) {
      expect(after[table]?.rows, `${table} restored rows`).toBeGreaterThanOrEqual(1)
    }
    expect((await readRpcs(client)).dcFlagged).toBeGreaterThanOrEqual(1)
  })
})
