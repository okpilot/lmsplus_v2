/** `courseCodes`: enrolled course codes for a student; absent/null = unknown, show everything. */
export type ShellUser = {
  displayName: string
  userRole: string
  courseCodes?: string[] | null
}

export function firstName(displayName: string): string | null {
  return displayName.trim().split(/\s+/)[0] || null
}
