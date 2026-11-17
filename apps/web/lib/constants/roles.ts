export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
}

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role
