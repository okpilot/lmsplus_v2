import { getAdminClient } from './supabase'

/** Soft-deletes the active exam_configs of a subject created at or after `createdSince` (service role). Zero rows is fine. */
export async function softDeleteSubjectExamConfigs(
  subjectCode: string,
  createdSince: string,
): Promise<void> {
  const admin = getAdminClient()
  const { data: subject, error: subjectError } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', subjectCode)
    .maybeSingle()
  if (subjectError) throw new Error(`softDeleteSubjectExamConfigs subject: ${subjectError.message}`)
  if (!subject) return

  const { data, error } = await admin
    .from('exam_configs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('subject_id', subject.id)
    .is('deleted_at', null)
    .gte('created_at', createdSince)
    .select('id')
  if (error) throw new Error(`softDeleteSubjectExamConfigs update: ${error.message}`)
  if (data && data.length > 0) {
    console.log(`softDeleteSubjectExamConfigs: soft-deleted ${data.length} config(s)`)
  }
}

/** Counts the active exam_configs of a subject (service role). 0 when the subject is missing. */
export async function countActiveSubjectExamConfigs(subjectCode: string): Promise<number> {
  const admin = getAdminClient()
  const { data: subject, error: subjectError } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', subjectCode)
    .maybeSingle()
  if (subjectError)
    throw new Error(`countActiveSubjectExamConfigs subject: ${subjectError.message}`)
  if (!subject) return 0

  const { count, error } = await admin
    .from('exam_configs')
    .select('id', { count: 'exact', head: true })
    .eq('subject_id', subject.id)
    .is('deleted_at', null)
  if (error) throw new Error(`countActiveSubjectExamConfigs count: ${error.message}`)
  return count ?? 0
}

type Admin = ReturnType<typeof getAdminClient>

/** Inserts an enabled exam_config (10 questions, 60 min, pass mark 75) and returns its id (service role). */
export async function insertExamConfig(
  admin: Admin,
  c: { orgId: string; subjectId: string },
): Promise<string> {
  const { data, error } = await admin
    .from('exam_configs')
    .insert({
      organization_id: c.orgId,
      subject_id: c.subjectId,
      enabled: true,
      total_questions: 10,
      time_limit_seconds: 3600,
      pass_mark: 75,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`exam_configs: ${error?.message ?? 'no data'}`)
  return data.id
}

const createdConfigIds = new Set<string>()
const MIN_CONFIGS = 2

type SubjectRow = { id: string; course_id: string }

/** The course whose subjects can reach `MIN_CONFIGS` enabled configs, and the subjects to configure. */
function pickConfigPlan(
  subjects: SubjectRow[],
  rows: { subject_id: string; enabled: boolean; deleted_at: string | null }[],
) {
  const taken = new Set(rows.map((r) => r.subject_id))
  const enabled = new Set(rows.filter((r) => r.enabled && !r.deleted_at).map((r) => r.subject_id))
  const byCourse = new Map<string, SubjectRow[]>()
  for (const s of subjects) byCourse.set(s.course_id, [...(byCourse.get(s.course_id) ?? []), s])
  for (const list of byCourse.values()) {
    const have = list.filter((s) => enabled.has(s.id)).length
    const free = list.filter((s) => !taken.has(s.id))
    if (have >= MIN_CONFIGS) return []
    if (free.length >= MIN_CONFIGS - have) return free.slice(0, MIN_CONFIGS - have)
  }
  return null
}

/**
 * Makes sure two enabled exam_configs exist for subjects of one course in the organization.
 * Inserts only the missing ones (tracked for `cleanupCreatedExamConfigs`); fails when no course can reach two.
 */
export async function ensureExamConfigs(orgId: string): Promise<void> {
  const admin = getAdminClient()
  const subjects = await admin.from('easa_subjects').select('id, course_id').is('deleted_at', null)
  if (subjects.error) throw new Error(`ensureExamConfigs subjects: ${subjects.error.message}`)
  const configs = await admin
    .from('exam_configs')
    .select('subject_id, enabled, deleted_at')
    .eq('organization_id', orgId)
  if (configs.error) throw new Error(`ensureExamConfigs configs: ${configs.error.message}`)
  const plan = pickConfigPlan(subjects.data ?? [], configs.data ?? [])
  if (plan === null) {
    throw new Error(
      `ensureExamConfigs: no course has ${MIN_CONFIGS} subjects that are enabled or free of a config row`,
    )
  }
  for (const s of plan)
    createdConfigIds.add(await insertExamConfig(admin, { orgId, subjectId: s.id }))
}

/** Hard-deletes the configs `ensureExamConfigs` created. Run after the sittings are deleted (trigger `trg_exam_config_sitting_block`). */
export async function cleanupCreatedExamConfigs(): Promise<void> {
  const ids = [...createdConfigIds]
  if (ids.length === 0) return
  const { data, error } = await getAdminClient()
    .from('exam_configs')
    .delete()
    .in('id', ids)
    .select('id')
  if (error) throw new Error(`cleanupCreatedExamConfigs: ${error.message}`)
  createdConfigIds.clear()
  if ((data?.length ?? 0) > 0)
    console.log(`cleanupCreatedExamConfigs: deleted ${data?.length} config(s)`)
}
