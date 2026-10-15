/**
 * Red Team Spec — Vector ID (#1412, mig 20261015000100): a deactivated student (Auth ban +
 * users.deleted_at, as toggle-student-status does it) replays a pre-ban access token straight at
 * PostgREST against every student RLS write cell: flagged_questions upsert + update,
 * question_comments insert + own delete, quiz_drafts own delete, quiz_sessions soft-delete,
 * users.full_name update. Each is refused and the protected row is unchanged.
 * CONTROL: the same token, after the student is restored, performs every write.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanupStudentActiveSessions, getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_ID_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

const BAN = '876000h'

type Fixtures = { commentId: string; draftId: string; sessionId: string }
type FlagState = { question_id: string; deleted_at: string | null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: deactivated student direct RLS writes (ID)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let orgId: string
  let studentId: string
  let q1: string
  let q2: string
  let originalName: string | null = null
  let flagsBefore: FlagState[] = []
  let deactivated = false

  const one = async (
    label: string,
    p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ) => {
    const { data, error } = await p
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`${label}: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const seedFixtures = async (): Promise<Fixtures> => {
    const commentId = await one(
      'seed comment',
      admin
        .from('question_comments')
        .insert({ question_id: q1, user_id: studentId, body: `${E2E_REDTEAM_ID_MARKER} own` })
        .select('id')
        .single(),
    )
    const draftId = await one(
      'seed draft',
      admin
        .from('quiz_drafts')
        .insert({
          student_id: studentId,
          organization_id: orgId,
          question_ids: [q1, q2],
          session_config: { e2e_marker: E2E_REDTEAM_ID_MARKER },
        })
        .select('id')
        .single(),
    )
    const sessionId = await one(
      'seed session',
      admin
        .from('quiz_sessions')
        .insert({
          organization_id: orgId,
          student_id: studentId,
          mode: 'mock_exam',
          total_questions: 2,
          time_limit_seconds: 3600,
          config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_ID_MARKER },
        })
        .select('id')
        .single(),
    )
    const { error } = await admin
      .from('flagged_questions')
      .upsert({ student_id: studentId, question_id: q2, deleted_at: null })
    if (error) throw new Error(`seed flag: ${error.message}`)
    return { commentId, draftId, sessionId }
  }

  const snapshot = async (f: Fixtures) => {
    const [c, d, s, fl, u] = await Promise.all([
      admin.from('question_comments').select('id').eq('id', f.commentId),
      admin.from('quiz_drafts').select('id').eq('id', f.draftId),
      admin.from('quiz_sessions').select('deleted_at').eq('id', f.sessionId).single(),
      admin
        .from('flagged_questions')
        .select('question_id, deleted_at')
        .eq('student_id', studentId)
        .in('question_id', [q1, q2]),
      admin.from('users').select('full_name').eq('id', studentId).single(),
    ])
    for (const r of [c, d, s, fl, u]) if (r.error) throw new Error(`snapshot: ${r.error.message}`)
    const flags = new Map((fl.data ?? []).map((r) => [r.question_id, r.deleted_at]))
    return {
      comment: (c.data ?? []).length,
      draft: (d.data ?? []).length,
      sessionDeleted: s.data?.deleted_at ?? null,
      q1Flag: flags.has(q1) ? (flags.get(q1) === null ? 'active' : 'deleted') : 'absent',
      q2Flag: flags.has(q2) ? (flags.get(q2) === null ? 'active' : 'deleted') : 'absent',
      fullName: u.data?.full_name ?? null,
    }
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

  // Every student RLS write cell, as the given client. Returns per-cell outcome.
  const attack = async (client: SupabaseClient, f: Fixtures) => {
    const flagInsert = await client
      .from('flagged_questions')
      .upsert({ student_id: studentId, question_id: q1, deleted_at: null })
    const flagUpdate = await client
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('question_id', q2)
      .select('question_id')
    const commentInsert = await client
      .from('question_comments')
      .insert({ question_id: q1, user_id: studentId, body: `${E2E_REDTEAM_ID_MARKER} attack` })
      .select('id')
    const commentDelete = await client
      .from('question_comments')
      .delete()
      .eq('id', f.commentId)
      .select('id')
    const draftDelete = await client.from('quiz_drafts').delete().eq('id', f.draftId).select('id')
    const sessionDiscard = await client
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.sessionId)
      .select('id')
    const rename = await client
      .from('users')
      .update({ full_name: E2E_REDTEAM_ID_MARKER })
      .eq('id', studentId)
      .select('id')
    return {
      flagInsert,
      flagUpdate,
      commentInsert,
      commentDelete,
      draftDelete,
      sessionDiscard,
      rename,
    }
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active questions')
    const [r1, r2] = data
    if (typeof r1?.id !== 'string' || typeof r2?.id !== 'string')
      throw new Error('bad question ids')
    q1 = r1.id
    q2 = r2.id
  })

  test.beforeEach(async () => {
    await cleanupStudentActiveSessions(ATTACKER_EMAIL)
    const u = await admin.from('users').select('full_name').eq('id', studentId).single()
    if (u.error) throw new Error(`beforeEach name: ${u.error.message}`)
    originalName = u.data?.full_name ?? null
    const fl = await admin
      .from('flagged_questions')
      .select('question_id, deleted_at')
      .eq('student_id', studentId)
      .in('question_id', [q1, q2])
    if (fl.error) throw new Error(`beforeEach flags: ${fl.error.message}`)
    flagsBefore = fl.data ?? []
  })

  test.afterEach(async () => {
    const errors: string[] = []
    const step = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn()
      } catch (e) {
        errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await step('restore', async () => {
      if (deactivated) await setDeactivated(false)
    })
    await step('name', async () => {
      const { error } = await admin
        .from('users')
        .update({ full_name: originalName })
        .eq('id', studentId)
      if (error) throw new Error(error.message)
    })
    await step('flags', async () => {
      const prior = new Map(flagsBefore.map((r) => [r.question_id, r.deleted_at]))
      for (const q of [q1, q2]) {
        // Never existed before → soft-delete; existed → restore its prior deleted_at.
        const value = prior.has(q) ? (prior.get(q) ?? null) : new Date().toISOString()
        const { error } = await admin
          .from('flagged_questions')
          .update({ deleted_at: value })
          .eq('student_id', studentId)
          .eq('question_id', q)
        if (error) throw new Error(error.message)
      }
    })
    await step('comments (hard-delete by policy, docs/database.md)', async () => {
      const { data, error } = await admin
        .from('question_comments')
        .delete()
        .like('body', `${E2E_REDTEAM_ID_MARKER}%`)
        .select('id')
      if (error) throw new Error(error.message)
      if ((data?.length ?? 0) > 0) console.info(`[ID] removed ${data?.length} comment(s)`)
    })
    await step('drafts (hard-delete by design, docs/database.md)', async () => {
      const { data, error } = await admin
        .from('quiz_drafts')
        .delete()
        .eq('session_config->>e2e_marker', E2E_REDTEAM_ID_MARKER)
        .select('id')
      if (error) throw new Error(error.message)
      if ((data?.length ?? 0) > 0) console.info(`[ID] removed ${data?.length} draft(s)`)
    })
    await step('sessions', async () => {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_ID_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      if ((data?.length ?? 0) > 0) console.info(`[ID] soft-deleted ${data?.length} session(s)`)
    })
    await step('active sessions', () => cleanupStudentActiveSessions(ATTACKER_EMAIL))
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('ID: a banned, soft-deleted student with a live token writes nothing via RLS', async () => {
    const client = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const f = await seedFixtures()
    // Force q1 unflagged so the upsert arm has an observable effect.
    const unflag = await admin
      .from('flagged_questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', studentId)
      .eq('question_id', q1)
    if (unflag.error) throw new Error(`unflag q1: ${unflag.error.message}`)

    const before = await snapshot(f)
    expect(before).toMatchObject({ comment: 1, draft: 1, sessionDeleted: null, q2Flag: 'active' })
    expect(before.q1Flag).not.toBe('active')
    expect(before.fullName).not.toBe(E2E_REDTEAM_ID_MARKER)

    await setDeactivated(true)
    const hit = await attack(client, f)
    expect(hit.flagInsert.error?.code).toBe('42501')
    expect(hit.commentInsert.error?.code).toBe('42501')
    for (const r of [
      hit.flagUpdate,
      hit.commentDelete,
      hit.draftDelete,
      hit.sessionDiscard,
      hit.rename,
    ]) {
      expect(r.error).toBeNull()
      expect(r.data ?? []).toHaveLength(0)
    }
    const held = await snapshot(f)
    expect(held).toEqual(before)

    // CONTROL: same token, student restored → every cell writes.
    await setDeactivated(false)
    const own = await attack(client, f)
    expect(own.flagInsert.error).toBeNull()
    expect(own.commentInsert.error).toBeNull()
    expect(own.commentInsert.data ?? []).toHaveLength(1)
    for (const r of [
      own.flagUpdate,
      own.commentDelete,
      own.draftDelete,
      own.sessionDiscard,
      own.rename,
    ]) {
      expect(r.error).toBeNull()
      expect(r.data ?? []).toHaveLength(1)
    }
    const after = await snapshot(f)
    expect(after).toMatchObject({
      comment: 0,
      draft: 0,
      q1Flag: 'active',
      q2Flag: 'deleted',
      fullName: E2E_REDTEAM_ID_MARKER,
    })
    expect(after.sessionDeleted).not.toBeNull()
  })
})
