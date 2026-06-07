/**
 * Standard discriminated-union result returned by Server Actions.
 * Canonical definition — consolidated from duplicated local copies (#797).
 */
export type ActionResult = { success: true } | { success: false; error: string }
