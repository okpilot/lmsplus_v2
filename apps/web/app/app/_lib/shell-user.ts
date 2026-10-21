export type ShellUser = { displayName: string; userRole: string }

export function firstName(displayName: string): string | null {
  return displayName.trim().split(/\s+/)[0] || null
}
