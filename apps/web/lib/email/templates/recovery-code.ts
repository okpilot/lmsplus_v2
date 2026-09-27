type RecoveryCodeEmailArgs = {
  code: string
}

type EmailContent = { subject: string; html: string; text: string }

/** HTML-encode a value before interpolating it into the HTML body. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds the forgot-password recovery-code email (subject/html/text). Pure:
 * no I/O, no env access — the code is caller-generated (`issueRecoveryCode`)
 * and never logged here. Carries only the code, never a clickable link — a
 * single-use recovery link gets consumed by mail scanners before the student
 * ever clicks it.
 */
export function recoveryCodeEmail({ code }: RecoveryCodeEmailArgs): EmailContent {
  const subject = 'Your LMS Plus password reset code'

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <p>Hello,</p>
    <p>Use this code to reset your LMS Plus password:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; font-family: 'Courier New', monospace;">${esc(code)}</p>
    <p>This code expires in 1 hour.</p>
    <p style="color: #6b7280; font-size: 13px;">If you did not ask to reset your password, you can safely ignore this email.</p>
  </body>
</html>`

  const text = `Hello,

Use this code to reset your LMS Plus password:

${code}

This code expires in 1 hour.

If you did not ask to reset your password, you can safely ignore this email.`

  return { subject, html, text }
}
