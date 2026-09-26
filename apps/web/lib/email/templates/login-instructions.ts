import { formatExpiry } from '@/lib/email/format-expiry'

type LoginInstructionsEmailArgs = {
  fullName: string | null
  email: string
  tempPassword: string
  expiresAt: string
  loginUrl: string
}

type EmailContent = { subject: string; html: string; text: string }

/** HTML-encode a value before interpolating it into the HTML body (DB-derived or otherwise). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds the admin-triggered login-instructions email (subject/html/text).
 * Pure: no I/O, no env access — every value comes from the caller. The
 * temporary password is caller-generated server-side and never logged here.
 */
export function loginInstructionsEmail({
  fullName,
  email,
  tempPassword,
  expiresAt,
  loginUrl,
}: LoginInstructionsEmailArgs): EmailContent {
  const greeting = fullName ? `Hello ${fullName},` : 'Hello,'
  const expiry = formatExpiry(expiresAt)
  const subject = 'Your LMS Plus login details'

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <p>${fullName ? `Hello ${esc(fullName)},` : 'Hello,'}</p>
    <p>Your login details for LMS Plus are below.</p>
    <p>Email: <strong>${esc(email)}</strong></p>
    <p>Temporary password: <strong style="font-family: 'Courier New', monospace; letter-spacing: 1px;">${esc(tempPassword)}</strong></p>
    <p>This temporary password expires on <strong>${esc(expiry)} (UTC)</strong>. You will be asked to choose your own password when you log in.</p>
    <p>
      <a href="${esc(loginUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Go to login</a>
    </p>
    <p style="color: #6b7280; font-size: 13px;">If the button does not work, copy and paste this link into your browser:<br />${esc(loginUrl)}</p>
  </body>
</html>`

  const text = `${greeting}

Your login details for LMS Plus are below.

Email: ${email}
Temporary password: ${tempPassword}

This temporary password expires on ${expiry} (UTC). You will be asked to choose your own password when you log in.

Go to login: ${loginUrl}`

  return { subject, html, text }
}
