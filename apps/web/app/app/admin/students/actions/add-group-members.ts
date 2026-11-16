'use server'

import type { GroupMembersResult } from './group-action-result'
import { runGroupMembersAction } from './run-group-members-action'

export async function addGroupMembers(input: unknown): Promise<GroupMembersResult> {
  return runGroupMembersAction('add_student_group_members', input)
}
