import { getAdminClient } from './supabase'

/** Marker prefix of every syllabus code a spec creates. Subject codes cap at 10 chars: prefix + 6. */
export const E2E_SYLLABUS_CODE_PREFIX = 'E2E-'

const CODE_LIKE = `${E2E_SYLLABUS_CODE_PREFIX}%`

/** A fresh, marked subject code (`E2E-` + 6 chars, within the 10-char column limit). */
export function newE2eSubjectCode(): string {
  return `${E2E_SYLLABUS_CODE_PREFIX}${Date.now().toString(36).slice(-6).toUpperCase()}`
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** PostgREST `or` filter: rows under any of `parentIds`, or carrying the marker in their own code. */
function scopeFilter(parentColumn: string, parentIds: string[]): string {
  const marked = `code.like.${CODE_LIKE}`
  return parentIds.length > 0 ? `${parentColumn}.in.(${parentIds.join(',')}),${marked}` : marked
}

async function runStep(errors: string[], label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    errors.push(`${label}: ${errorMessage(e)}`)
  }
}

function logDeleted(table: string, count: number): void {
  if (count > 0) console.log(`cleanupE2eSyllabus: deleted ${count} ${table} row(s)`)
}

async function findMarkedSubjectIds(): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('easa_subjects')
    .select('id')
    .like('code', CODE_LIKE)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.id)
}

async function findTopicIds(subjectIds: string[]): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('easa_topics')
    .select('id')
    .or(scopeFilter('subject_id', subjectIds))
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.id)
}

async function deleteSubtopics(topicIds: string[]): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('easa_subtopics')
    .delete()
    .or(scopeFilter('topic_id', topicIds))
    .select('id')
  if (error) throw new Error(error.message)
  logDeleted('easa_subtopics', data?.length ?? 0)
}

async function deleteTopics(subjectIds: string[]): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('easa_topics')
    .delete()
    .or(scopeFilter('subject_id', subjectIds))
    .select('id')
  if (error) throw new Error(error.message)
  logDeleted('easa_topics', data?.length ?? 0)
}

async function deleteSubjects(): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('easa_subjects')
    .delete()
    .like('code', CODE_LIKE)
    .select('id')
  if (error) throw new Error(error.message)
  logDeleted('easa_subjects', data?.length ?? 0)
}

/**
 * Hard-deletes every syllabus row a spec created, children first (service role). The three tables
 * have no `deleted_at`; deleting by marker never touches seeded rows. Zero rows is silent.
 * A failed step skips the later ones (FK order) and every failure is reported at the end.
 */
export async function cleanupE2eSyllabus(): Promise<void> {
  const errors: string[] = []
  let subjectIds: string[] = []
  let topicIds: string[] = []

  await runStep(errors, 'find subjects', async () => {
    subjectIds = await findMarkedSubjectIds()
  })
  if (errors.length === 0) {
    await runStep(errors, 'find topics', async () => {
      topicIds = await findTopicIds(subjectIds)
    })
  }
  if (errors.length === 0)
    await runStep(errors, 'delete subtopics', () => deleteSubtopics(topicIds))
  if (errors.length === 0) await runStep(errors, 'delete topics', () => deleteTopics(subjectIds))
  if (errors.length === 0) await runStep(errors, 'delete subjects', deleteSubjects)

  if (errors.length > 0) throw new Error(`cleanupE2eSyllabus: ${errors.join('; ')}`)
}
