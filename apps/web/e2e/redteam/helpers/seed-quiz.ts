import { getAdminClient } from '../../helpers/supabase'

/**
 * Pick the first subject (by `code` ASC) in `orgId` whose active, non-deleted
 * question count meets `minActiveQuestions`, then the first topic within that
 * subject (by `sort_order` ASC, then `id` ASC) whose active, non-deleted
 * question count meets `topicMinQuestions`.
 *
 * Deterministic replacement for the `.limit(1)` "first subject + first topic"
 * pattern used across red-team specs. PostgREST `.limit(1)` without ORDER BY
 * returns rows in physical order — after seed 080 added a taxonomy-only
 * subject with zero questions, that pattern intermittently picked an empty
 * subject and crashed `start_quiz_session` (issue #622).
 *
 * Throws with a descriptive message if no subject or no topic meets the
 * threshold, so test failures are loud rather than silent.
 */
export async function pickSubjectWithQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; minActiveQuestions?: number; topicMinQuestions?: number },
): Promise<{ subjectId: string; subjectCode: string; topicId: string }> {
  const { orgId } = opts
  const minActiveQuestions = opts.minActiveQuestions ?? 1
  const topicMinQuestions = opts.topicMinQuestions ?? 1

  // easa_subjects is shared reference data (no organization_id, no deleted_at).
  // Org scoping lives on `questions` and is enforced by countActiveQuestions below.
  const { data: subjects, error: subjectsError } = await admin
    .from('easa_subjects')
    .select('id, code')
    .order('code', { ascending: true })
  if (subjectsError) throw new Error(`pickSubjectWithQuestions subjects: ${subjectsError.message}`)
  if (!subjects || subjects.length === 0)
    throw new Error(`pickSubjectWithQuestions: no easa_subjects found (orgId=${orgId})`)

  for (const subject of subjects) {
    const subjectQCount = await countActiveQuestions(admin, { orgId, subjectId: subject.id })
    if (subjectQCount < minActiveQuestions) continue

    const topicId = await findTopicWithQuestions(admin, {
      orgId,
      subjectId: subject.id,
      subjectCode: subject.code,
      topicMinQuestions,
    })
    if (topicId) return { subjectId: subject.id, subjectCode: subject.code, topicId }
  }

  throw new Error(
    `pickSubjectWithQuestions: no subject in org ${orgId} has ` +
      `>=${minActiveQuestions} active question(s) with a topic having ` +
      `>=${topicMinQuestions} active question(s)`,
  )
}

async function findTopicWithQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; subjectId: string; subjectCode: string; topicMinQuestions: number },
): Promise<string | null> {
  const { orgId, subjectId, subjectCode, topicMinQuestions } = opts

  // easa_topics is shared reference data (no organization_id, no deleted_at).
  // Org scoping is enforced by the countActiveQuestions call below.
  const { data: topics, error: topicsError } = await admin
    .from('easa_topics')
    .select('id, sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  if (topicsError)
    throw new Error(`pickSubjectWithQuestions topics for ${subjectCode}: ${topicsError.message}`)
  if (!topics || topics.length === 0) return null

  for (const topic of topics) {
    const count = await countActiveQuestions(admin, { orgId, subjectId, topicId: topic.id })
    if (count >= topicMinQuestions) return topic.id
  }
  return null
}

async function countActiveQuestions(
  admin: ReturnType<typeof getAdminClient>,
  opts: { orgId: string; subjectId: string; topicId?: string },
): Promise<number> {
  let q = admin
    .from('questions')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', opts.orgId)
    .eq('subject_id', opts.subjectId)
    .eq('status', 'active')
    .is('deleted_at', null)
  if (opts.topicId) q = q.eq('topic_id', opts.topicId)
  const { count, error } = await q
  if (error)
    throw new Error(
      `pickSubjectWithQuestions count subject=${opts.subjectId} topic=${opts.topicId ?? 'none'}: ${error.message}`,
    )
  return count ?? 0
}

/**
 * Ensure an enabled exam_config (with at least one distribution row) exists for
 * (orgId, subjectId). Idempotent. Returns the exam_config id.
 *
 * Used by internal-exam red-team specs that exercise issue/start RPCs which
 * require an exam_config row to be present.
 */
export async function ensureExamConfig(
  orgId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const admin = getAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('exam_configs')
    .select('id, enabled')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (existingError) throw new Error(`ensureExamConfig select: ${existingError.message}`)

  let configId: string
  if (existing) {
    configId = existing.id
    if (!existing.enabled) {
      const { error: enableError } = await admin
        .from('exam_configs')
        .update({ enabled: true })
        .eq('id', configId)
      if (enableError) throw new Error(`ensureExamConfig enable: ${enableError.message}`)
    }
  } else {
    const { data: created, error: createError } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (createError || !created) throw new Error(`ensureExamConfig insert: ${createError?.message}`)
    configId = created.id
  }

  // Ensure at least one distribution row.
  const { data: dist, error: distLookupError } = await admin
    .from('exam_config_distributions')
    .select('id')
    .eq('exam_config_id', configId)
    .order('id', { ascending: true })
    .limit(1)
  if (distLookupError) throw new Error(`ensureExamConfig dist lookup: ${distLookupError.message}`)
  if (!dist || dist.length === 0) {
    const { error: distError } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configId,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distError) throw new Error(`ensureExamConfig distribution: ${distError.message}`)
  }

  return configId
}
