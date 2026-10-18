import { formatOtpLifetime } from '@/lib/auth/email-otp-config'
import { forgotPasswordSteps } from '@/lib/auth/set-password-link'

type LoginInstructionsEmailArgs = {
  fullName: string | null
  email: string
  setPasswordUrl: string
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

type BodyContent = {
  greeting: string
  fullName: string | null
  email: string
  setPasswordUrl: string
  loginUrl: string
  validity: string
  steps: string[]
}

function buildHtml(c: BodyContent): string {
  return `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <p>${c.fullName ? `Hello ${esc(c.fullName)},` : 'Hello,'}</p>
    <p>Use the link below to set the password for your LMS Plus account <strong>${esc(c.email)}</strong>.</p>
    <p>
      <a href="${esc(c.setPasswordUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Set my password</a>
    </p>
    <p style="color: #6b7280; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word;">If the button does not work, copy and paste this link into your browser:<br />${esc(c.setPasswordUrl)}</p>
    <p>${esc(c.validity)}</p>
    <p><strong>If the link has expired:</strong></p>
    <ol>
${c.steps.map((step) => `      <li>${esc(step)}</li>`).join('\n')}
    </ol>
    <p style="color: #6b7280; font-size: 13px;">Login page: ${esc(c.loginUrl)}</p>
  </body>
</html>`
}

function buildText(c: BodyContent): string {
  return `${c.greeting}

Use the link below to set the password for your LMS Plus account ${c.email}.

Set my password: ${c.setPasswordUrl}

${c.validity}

If the link has expired:
${c.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Login page: ${c.loginUrl}`
}

/**
 * Builds the admin-triggered set-password email (subject/html/text). Pure:
 * no I/O, no env access — every value comes from the caller. The link carries
 * a one-time token and is never logged here.
 */
export function loginInstructionsEmail({
  fullName,
  email,
  setPasswordUrl,
  loginUrl,
}: LoginInstructionsEmailArgs): EmailContent {
  const greeting = fullName ? `Hello ${fullName},` : 'Hello,'
  const lifetime = formatOtpLifetime()
  const validity = `This link works once and expires ${lifetime} after this email was sent. Asking for a new link makes this one stop working.`
  const steps = forgotPasswordSteps()
  const subject = 'Set your LMS Plus password'

  const content: BodyContent = {
    greeting,
    fullName,
    email,
    setPasswordUrl,
    loginUrl,
    validity,
    steps,
  }

  return { subject, html: buildHtml(content), text: buildText(content) }
}
