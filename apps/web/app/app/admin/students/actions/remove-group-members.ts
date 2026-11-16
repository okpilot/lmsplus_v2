'use server'

import type { GroupMembersResult } from './group-action-result'
import { runGroupMembersAction } from './run-group-members-action'

export async function removeGroupMembers(input: unknown): Promise<GroupMembersResult> {
  return runGroupMembersAction('remove_student_group_members', input)
}
