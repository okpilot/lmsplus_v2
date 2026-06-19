import { Resend } from 'resend'

type SendEmailArgs = {
  to: string
  subject: string
  html: string
  text: string
}

type SendEmailResult = { ok: boolean; error?: string }

/**
 * Sends a transactional email via Resend.
 *
 * Local-dev/test fallback: with no RESEND_API_KEY set in a non-production
 * environment, logs the intent and returns ok so the surrounding flow is
 * testable before domain verification. In production a missing key fails loudly
 * (returns ok:false, no PII logged) so the caller surfaces an error instead of a
 * false success. EMAIL_FROM is mandatory whenever a real send is attempted.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[sendEmail] RESEND_API_KEY is not set — cannot send email')
      return { ok: false, error: 'send_failed' }
    }
    // Redact the recipient — don't leak student PII into shared dev/test logs.
    const redactedTo = to.replace(/^(.).*(@.*)$/, '$1***$2')
    console.log('[email] (dev, no RESEND_API_KEY) would send:', { to: redactedTo, subject })
    return { ok: true }
  }

  const from = process.env.EMAIL_FROM
  if (!from) {
    console.warn('[sendEmail] EMAIL_FROM not configured')
    return { ok: false, error: 'EMAIL_FROM not configured' }
  }

  try {
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({ from, to, subject, html, text })
    if (result.error) {
      // Log the raw third-party detail server-side, but never let it flow through
      // the exported SendEmailResult.error type — return a generic string.
      console.error('[sendEmail] Resend error:', result.error.message)
      return { ok: false, error: 'send_failed' }
    }
    return { ok: true }
  } catch (e) {
    // The SDK can throw (network failure, unexpected validation) rather than
    // returning { error } — keep sendEmail self-defending so callers never see a throw.
    console.error('[sendEmail] Unexpected error:', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'send_failed' }
  }
}
