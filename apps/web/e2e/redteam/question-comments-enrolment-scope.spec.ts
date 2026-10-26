/**
 * Red Team Spec — question_comments scope (#1637 sibling of the enrolment gate).
 *   KM: a student enrolled in VFR_RT only reads no comment on a PPL (050) question and cannot
 *       post one.
 *   KN: a student of another org reads no comment on an egmont question.
 * CONTROL: a student enrolled in PPL_A + VFR_RT of the same org reads the comment and posts one.
 *
 * Status: Expected to FAIL against mig 20261021000100 `question_comments_select` (no enrolment or
 * org predicate) and `question_comments_insert` (no question predicate). Skipped until fixed.
 */

import { expect, test } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { getEgmontOrgId, getOrCreateOtherOrg, upsertUser } from './helpers/seed-core'

const E2E_REDTEAM_COMMENT_SCOPE_MARKER = '[E2E_REDTEAM] comment-scope fixture'
const RT_ONLY_EMAIL = 'redteam-enrol-rt-only@lmsplus.local'
const RT_ONLY_PASSWORD = 'redteam-enrol-rt-only-2026!'
const FULL_EMAIL = 'redteam-enrol-full@lmsplus.local'
const FULL_PASSWORD = 'redteam-enrol-full-2026!'
const OTHER_ORG_EMAIL = 'redteam-comment-scope-other-org@lmsplus.local'
const OTHER_ORG_PASSWORD = 'redteam-comment-scope-other-org-2026!'
const PPL_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000001'
const VFR_RT_COURSE_ID = 'c0a5e000-0000-4000-8000-000000000002'

test.describe('Red Team: question_comments enrolment and org scope (KM, KN)', () => {
  test.setTimeout(120_000)

  let admin: ReturnType<typeof getAdminClient>
  let rtOnlyId: string
  let fullId: string
  let rtOnly: SupabaseClient
  let full: SupabaseClient
  let otherOrg: SupabaseClient
  let pplQuestionId: string
  let commentId: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const orgId = await getEgmontOrgId(admin)
    const otherOrgId = await getOrCreateOtherOrg(admin)
    rtOnlyId = await upsertUser(admin, RT_ONLY_EMAIL, RT_ONLY_PASSWORD, orgId)
    fullId = await upsertUser(admin, FULL_EMAIL, FULL_PASSWORD, orgId)
    await upsertUser(admin, OTHER_ORG_EMAIL, OTHER_ORG_PASSWORD, otherOrgId)

    const { error: unenrolErr } = await admin
      .from('course_enrolments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', rtOnlyId)
      .eq('course_id', PPL_COURSE_ID)
      .is('deleted_at', null)
    if (unenrolErr) throw new Error(`unenrol PPL: ${unenrolErr.message}`)
    const { data: live, error: liveErr } = await admin
      .from('course_enrolments')
      .select('course_id')
      .eq('user_id', rtOnlyId)
      .is('deleted_at', null)
    if (liveErr) throw new Error(`enrolments: ${liveErr.message}`)
    expect((live ?? []).map((r) => r.course_id)).toEqual([VFR_RT_COURSE_ID])

    const { data: subj, error: subjErr } = await admin
      .from('easa_subjects')
      .select('id, course_id')
      .eq('code', '050')
      .single()
    if (subjErr || !subj) throw new Error(`subject 050: ${subjErr?.message}`)
    expect(subj.course_id).toBe(PPL_COURSE_ID)
    const { data: q, error: qErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subj.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id')
      .limit(1)
      .single()
    if (qErr || !q) throw new Error(`ppl question: ${qErr?.message}`)
    pplQuestionId = q.id

    rtOnly = await createAuthenticatedClient(RT_ONLY_EMAIL, RT_ONLY_PASSWORD)
    full = await createAuthenticatedClient(FULL_EMAIL, FULL_PASSWORD)
    otherOrg = await createAuthenticatedClient(OTHER_ORG_EMAIL, OTHER_ORG_PASSWORD)
  })

  test.beforeEach(async () => {
    const { data, error } = await admin
      .from('question_comments')
      .insert({
        question_id: pplQuestionId,
        user_id: fullId,
        body: E2E_REDTEAM_COMMENT_SCOPE_MARKER,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed comment: ${error?.message}`)
    commentId = data.id
  })

  // question_comments is hard-delete by policy (code-style §7 Hermeticity item 4).
  test.afterEach(async () => {
    const { data, error } = await admin
      .from('question_comments')
      .delete()
      .eq('body', E2E_REDTEAM_COMMENT_SCOPE_MARKER)
      .select('id')
    if (error) throw new Error(`afterEach comments: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.log(`[comment-scope] removed ${data?.length} comment(s)`)
  })

  test('KM: a student not enrolled in PPL reads and posts no comment on a PPL question', async () => {
    const control = await full.from('question_comments').select('id').eq('id', commentId)
    expect(control.error).toBeNull()
    expect(control.data).toHaveLength(1)
    const controlPost = await full
      .from('question_comments')
      .insert({
        question_id: pplQuestionId,
        user_id: fullId,
        body: E2E_REDTEAM_COMMENT_SCOPE_MARKER,
      })
      .select('id')
    expect(controlPost.error).toBeNull()
    expect(controlPost.data).toHaveLength(1)

    const read = await rtOnly.from('question_comments').select('id').eq('id', commentId)
    expect(read.error).toBeNull()
    expect(read.data).toHaveLength(0)

    const post = await rtOnly
      .from('question_comments')
      .insert({
        question_id: pplQuestionId,
        user_id: rtOnlyId,
        body: E2E_REDTEAM_COMMENT_SCOPE_MARKER,
      })
      .select('id')
    expect(post.error).not.toBeNull()
    const { data: rows, error } = await admin
      .from('question_comments')
      .select('id')
      .eq('user_id', rtOnlyId)
      .eq('body', E2E_REDTEAM_COMMENT_SCOPE_MARKER)
    expect(error).toBeNull()
    expect(rows).toHaveLength(0)
  })

  test('KN: a student of another org reads no comment on an egmont question', async () => {
    const control = await full.from('question_comments').select('id').eq('id', commentId)
    expect(control.error).toBeNull()
    expect(control.data).toHaveLength(1)

    const read = await otherOrg.from('question_comments').select('id, body').eq('id', commentId)
    expect(read.error).toBeNull()
    expect(read.data).toHaveLength(0)
  })
})
