import { formatOtpLifetime } from '@/lib/auth/email-otp-config'

export type LoginInstructionsState = 'not_sent' | 'waiting' | 'password_set'

type LoginInstructionsInput = {
  sentAt: string | null
  /** `users.temp_password_expires_at`: non-null = "sent, own password not set yet". */
  pendingAt: string | null
}

/**
 * Derives the state from the two columns the send flow and the password
 * writers maintain: `login_instructions_sent_at` and the pending marker
 * `temp_password_expires_at`.
 * - Marker set → `waiting` (its date is the legacy 7-day stamp, not a deadline).
 * - No marker, never sent → `not_sent`.
 * - No marker, sent → `password_set`.
 */
export function computeLoginInstructionsState({
  sentAt,
  pendingAt,
}: LoginInstructionsInput): LoginInstructionsState {
  if (pendingAt !== null) return 'waiting'
  return sentAt === null ? 'not_sent' : 'password_set'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium' })
}

export function loginInstructionsStateLabel(state: LoginInstructionsState): string {
  switch (state) {
    case 'not_sent':
      return 'Not sent yet'
    case 'waiting':
      return 'Link sent, not used yet'
    case 'password_set':
      return 'Password set'
    default:
      return state
  }
}

export function loginInstructionsConfirmText(state: LoginInstructionsState, name: string): string {
  switch (state) {
    case 'password_set':
      return `${name} already has a password. Resending emails a new set-password link; their current password keeps working until they choose a new one.`
    case 'not_sent':
      return `Email ${name} a link to set their password? The link works once, for ${formatOtpLifetime()}.`
    default:
      return 'Send a new set-password link? The earlier link stops working.'
  }
}

export function formatLastSent(iso: string): string {
  return formatDate(iso)
}
