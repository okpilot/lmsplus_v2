export type LoginInstructionsState = 'not_sent' | 'waiting' | 'expired' | 'password_set'

type LoginInstructionsInput = {
  sentAt: string | null
  expiresAt: string | null
}

/**
 * Derives the login-instructions state from the two columns the send flow
 * writes: `login_instructions_sent_at` and `temp_password_expires_at`.
 * - Never sent → `not_sent`.
 * - Sent but no armed expiry (the student has set their own password) → `password_set`.
 * - Expiry in the past → `expired`.
 * - Otherwise → `waiting`.
 */
export function computeLoginInstructionsState(
  { sentAt, expiresAt }: LoginInstructionsInput,
  now: Date = new Date(),
): LoginInstructionsState {
  if (sentAt === null) return 'not_sent'
  if (expiresAt === null) return 'password_set'
  return new Date(expiresAt).getTime() <= now.getTime() ? 'expired' : 'waiting'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium' })
}

export function loginInstructionsStateLabel(
  state: LoginInstructionsState,
  expiresAt: string | null,
): string {
  switch (state) {
    case 'not_sent':
      return 'Not sent yet'
    case 'waiting':
      // expiresAt is non-null whenever state is 'waiting' (see computeLoginInstructionsState).
      return `Waiting (valid until ${expiresAt ? formatDate(expiresAt) : ''})`
    case 'expired':
      return 'Expired'
    case 'password_set':
      return 'Password set'
    default:
      return state
  }
}

export function loginInstructionsConfirmText(state: LoginInstructionsState, name: string): string {
  switch (state) {
    case 'password_set':
      return `${name} has their own password. Resending replaces it with a new temporary one.`
    case 'not_sent':
      return `Send login instructions to ${name}? Any password they use now stops working.`
    default:
      return 'Send a new temporary password? The earlier one stops working.'
  }
}

export function formatLastSent(iso: string): string {
  return formatDate(iso)
}
