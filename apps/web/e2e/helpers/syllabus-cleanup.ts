import { randomUUID } from 'node:crypto'
import { getAdminClient } from './supabase'

/** Marker prefix on syllabus `code` for rows created by syllabus E2E specs (subject code is max 10 chars). */
export const SYLLABUS_E2E_CODE_PREFIX = 'E2E-'

const CODE_LIKE = `${SYLLABUS_E2E_CODE_PREFIX}%`

/** Unique marked subject code, <= 10 chars. Random: a deleted code stays reserved. */
export function makeSyllabusE2eCode(): string {
  return `${SYLLABUS_E2E_CODE_PREFIX}${randomUUID().slice(0, 6).toUpperCase()}`
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
  if (count > 0) console.log(`cleanupE2eSyllabus: soft-deleted ${count} ${table} row(s)`)
}

async function findMarkedSubjectIds(): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('easa_subjects')
    .select('id')
    .like('code', CODE_LIKE)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.id)
}

async function findTopicIds(subjectIds: string[]): Promise<string[]> {
  const { data, error } = await getAdminClient()
    .from('easa_topics')
    .select('id')
    .or(scopeFilter('subject_id', subjectIds))
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.id)
}

async function softDeleteSubtopics(topicIds: string[]): Promise<number> {
  const { data, error } = await getAdminClient()
    .from('easa_subtopics')
    .update({ deleted_at: new Date().toISOString() })
    .or(scopeFilter('topic_id', topicIds))
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  const count = data?.length ?? 0
  logDeleted('easa_subtopics', count)
  return count
}

async function softDeleteTopics(subjectIds: string[]): Promise<number> {
  const { data, error } = await getAdminClient()
    .from('easa_topics')
    .update({ deleted_at: new Date().toISOString() })
    .or(scopeFilter('subject_id', subjectIds))
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  const count = data?.length ?? 0
  logDeleted('easa_topics', count)
  return count
}

async function softDeleteSubjects(): Promise<number> {
  const { data, error } = await getAdminClient()
    .from('easa_subjects')
    .update({ deleted_at: new Date().toISOString() })
    .like('code', CODE_LIKE)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  const count = data?.length ?? 0
  logDeleted('easa_subjects', count)
  return count
}

/**
 * Soft-deletes every still-active syllabus row a spec created, children first (service role).
 * Scoped by marker; seeded rows are never touched. Zero rows is silent. Returns the total count.
 * The first failed step stops the later ones (FK order) and its error is thrown.
 */
export async function cleanupE2eSyllabus(): Promise<number> {
  const errors: string[] = []
  let subjectIds: string[] = []
  let topicIds: string[] = []
  let total = 0

  await runStep(errors, 'find subjects', async () => {
    subjectIds = await findMarkedSubjectIds()
  })
  if (errors.length === 0) {
    await runStep(errors, 'find topics', async () => {
      topicIds = await findTopicIds(subjectIds)
    })
  }
  if (errors.length === 0) {
    await runStep(errors, 'delete subtopics', async () => {
      total += await softDeleteSubtopics(topicIds)
    })
  }
  if (errors.length === 0) {
    await runStep(errors, 'delete topics', async () => {
      total += await softDeleteTopics(subjectIds)
    })
  }
  if (errors.length === 0) {
    await runStep(errors, 'delete subjects', async () => {
      total += await softDeleteSubjects()
    })
  }

  if (errors.length > 0) throw new Error(`cleanupE2eSyllabus: ${errors.join('; ')}`)
  return total
}

/** Reads a marked subject's `deleted_at` by code (service role). `undefined` when no row exists. */
export async function getSubjectDeletedAt(code: string): Promise<string | null | undefined> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('easa_subjects')
    .select('deleted_at')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`getSubjectDeletedAt: ${error.message}`)
  return data ? data.deleted_at : undefined
}
