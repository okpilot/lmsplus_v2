import { randomUUID } from 'node:crypto'
import { getAdminClient } from './supabase'

/** Marker prefix on `student_groups.name` for rows created by student-group E2E specs. */
export const STUDENT_GROUP_E2E_PREFIX = 'E2E-GRP-'

const NAME_LIKE = `${STUDENT_GROUP_E2E_PREFIX}%`

/** Unique marked group name (<= 80 chars). Random: an active name is unique per org. */
export function makeStudentGroupE2eName(): string {
  return `${STUDENT_GROUP_E2E_PREFIX}${randomUUID().slice(0, 8)}`
}

/** Soft-delete marked groups and their active memberships. Zero marked rows is a no-op. */
export async function cleanupE2eStudentGroups(): Promise<void> {
  const admin = getAdminClient()
  const now = new Date().toISOString()
  const { data: groups, error: findErr } = await admin
    .from('student_groups')
    .select('id')
    .like('name', NAME_LIKE)
    .is('deleted_at', null)
  if (findErr) throw new Error(`cleanupE2eStudentGroups: ${findErr.message}`)
  const ids = (groups ?? []).map((g) => g.id)
  if (ids.length === 0) return

  const { error: memErr } = await admin
    .from('student_group_members')
    .update({ deleted_at: now })
    .in('group_id', ids)
    .is('deleted_at', null)
  if (memErr) throw new Error(`cleanupE2eStudentGroups members: ${memErr.message}`)

  const { error: grpErr } = await admin
    .from('student_groups')
    .update({ deleted_at: now })
    .in('id', ids)
  if (grpErr) throw new Error(`cleanupE2eStudentGroups groups: ${grpErr.message}`)
}
