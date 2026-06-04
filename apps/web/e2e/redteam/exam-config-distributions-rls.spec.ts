/**
 * Red Team Spec: exam_config_distributions parent-soft-delete RLS (#730, Vector CE)
 *
 * Mig 083 added `AND ec.deleted_at IS NULL` to all three admin RLS policies on
 * exam_config_distributions, so the distributions of a soft-deleted parent
 * exam_config are no longer reachable via direct PostgREST. The app already
 * filters client-side; this pins the direct-PostgREST/RLS guarantee.
 *  - CE: an org admin sees a distribution while the parent config is active, but
 *    gets an empty result once the parent is soft-deleted (SELECT policy).
 *  - parity: INSERT referencing a soft-deleted parent is rejected (WITH CHECK).
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamAdmin } from './helpers/seed'

test.describe('Red Team: exam_config_distributions parent-soft-delete RLS', () => {
  let admin: ReturnType<typeof getAdminClient>
  let adminClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let orgId: string
  let subjectId: string
  let topicId: string
  let configId: string

  const createdConfigIds = new Set<string>()

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seededAdmin = await seedRedTeamAdmin()
    orgId = seededAdmin.orgId
    adminClient = await createAuthenticatedClient(seededAdmin.email, seededAdmin.password)

    // Find a subject/topic with NO active egmont exam_config, so seeding a
    // throwaway config can't collide with the partial unique index
    // uq_exam_configs_org_subject_active (one active config per org+subject).
    const { data: topics, error: topicsErr } = await admin
      .from('easa_topics')
      .select('id, subject_id')
    if (topicsErr) throw new Error(`topics lookup: ${topicsErr.message}`)
    const { data: activeConfigs, error: cfgErr } = await admin
      .from('exam_configs')
      .select('subject_id')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
    if (cfgErr) throw new Error(`active config lookup: ${cfgErr.message}`)
    const used = new Set((activeConfigs ?? []).map((c) => c.subject_id))
    const freeTopic = (topics ?? []).find((t) => !used.has(t.subject_id))
    if (!freeTopic) throw new Error('no subject without an active exam_config available')
    subjectId = freeTopic.subject_id
    topicId = freeTopic.id
  })

  test.beforeEach(async () => {
    const { data: config, error: configErr } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 20,
        time_limit_seconds: 3600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (configErr || !config) throw new Error(`seed exam_config: ${configErr?.message}`)
    configId = config.id
    createdConfigIds.add(config.id)

    const { error: distErr } = await admin
      .from('exam_config_distributions')
      .insert({ exam_config_id: configId, topic_id: topicId, subtopic_id: null, question_count: 5 })
    if (distErr) throw new Error(`seed distribution: ${distErr.message}`)
  })

  test.afterEach(async () => {
    if (createdConfigIds.size === 0) return
    // Hard-delete the throwaway config (ON DELETE CASCADE removes its
    // distributions). The distribution table has no deleted_at column.
    try {
      const { data, error } = await admin
        .from('exam_configs')
        .delete()
        .in('id', Array.from(createdConfigIds))
        .select('id')
      if (error) throw new Error(`afterEach cleanup: ${error.message}`)
      if ((data?.length ?? 0) > 0) {
        console.log(`[distributions-rls] hard-deleted ${data?.length} exam_config(s)`)
      }
    } finally {
      createdConfigIds.clear()
    }
  })

  test('CE: distributions are visible while the parent is active, hidden after soft-delete', async () => {
    // Non-vacuous: the admin can read the distribution while the parent lives.
    const { data: before, error: beforeErr } = await adminClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', configId)
    expect(beforeErr).toBeNull()
    expect((before ?? []).length).toBeGreaterThan(0)

    // Soft-delete the parent exam_config.
    const { error: delErr } = await admin
      .from('exam_configs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', configId)
    expect(delErr).toBeNull()

    // RLS now hides the distribution from the org admin via direct PostgREST.
    const { data: after, error: afterErr } = await adminClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', configId)
    expect(afterErr).toBeNull()
    expect(after ?? []).toHaveLength(0)
  })

  test('CE parity: INSERT referencing a soft-deleted parent is rejected (WITH CHECK)', async () => {
    const { error: delErr } = await admin
      .from('exam_configs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', configId)
    expect(delErr).toBeNull()

    const { data, error } = await adminClient
      .from('exam_config_distributions')
      .insert({ exam_config_id: configId, topic_id: topicId, subtopic_id: null, question_count: 3 })
      .select('id')
    // WITH CHECK fails (parent deleted_at IS NOT NULL) → 42501.
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
