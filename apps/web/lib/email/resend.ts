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
 * Local-dev fallback: with no RESEND_API_KEY set, logs the intent and returns
 * ok so the surrounding flow is testable before domain verification. EMAIL_FROM
 * is mandatory whenever a real send is attempted.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] (dev, no RESEND_API_KEY) would send:', { to, subject })
    return { ok: true }
  }

  const from = process.env.EMAIL_FROM
  if (!from) {
    console.warn('[sendEmail] EMAIL_FROM not configured')
    return { ok: false, error: 'EMAIL_FROM not configured' }
  }

  const resend = new Resend(apiKey)
  const result = await resend.emails.send({ from, to, subject, html, text })
  if (result.error) {
    // Log the raw third-party detail server-side, but never let it flow through
    // the exported SendEmailResult.error type — return a generic string.
    console.error('[sendEmail] Resend error:', result.error.message)
    return { ok: false, error: 'send_failed' }
  }
  return { ok: true }
}
