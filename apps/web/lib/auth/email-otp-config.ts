/**
 * Lifetime of a Supabase email OTP / recovery token. Local value is
 * `supabase/config.toml` `otp_expiry` (pinned by the test); the production
 * value is `mailer_otp_exp` in the Dashboard, read via the Management API on
 * 2026-10-18 and equal to this. No digit count is stated anywhere: production
 * codes are 8 digits, local ones 6.
 */
export const EMAIL_OTP_EXPIRY_SECONDS = 3600

/** Human wording of the OTP lifetime for email and UI copy, e.g. "1 hour". */
export function formatOtpLifetime(): string {
  const hours = EMAIL_OTP_EXPIRY_SECONDS / 3600
  return hours === 1 ? '1 hour' : `${hours} hours`
}
