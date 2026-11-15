export type GroupMembersResult =
  | { success: true; count: number }
  | { success: false; error: string }

export const GROUP_RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authorized',
  not_admin: 'Not authorized',
  admin_not_found: 'Not authorized',
  invalid_input: 'Invalid input',
  group_not_found: 'Group not found',
  group_name_taken: 'A group with this name already exists',
  student_not_found: 'Some selected students are inactive or not found',
}
