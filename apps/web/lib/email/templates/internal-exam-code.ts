type InternalExamCodeEmailArgs = {
  studentName: string | null
  subjectName: string
  code: string
  expiresAt: string
  examUrl: string
}

type EmailContent = { subject: string; html: string; text: string }

/** HTML-encode a value before interpolating it into the HTML body (DB-derived or otherwise). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return expiresAt
  return date.toLocaleString('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Builds the per-student internal exam code email (subject/html/text).
 * Pure: no I/O, no env access — every value comes from the caller. The inputs
 * (studentName, subjectName) are server-trusted DB values.
 */
export function internalExamCodeEmail({
  studentName,
  subjectName,
  code,
  expiresAt,
  examUrl,
}: InternalExamCodeEmailArgs): EmailContent {
  const greeting = studentName ? `Hello ${studentName},` : 'Hello,'
  const expiry = formatExpiry(expiresAt)
  const subject = `Your exam access code for ${subjectName}`

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; line-height: 1.5;">
    <p>${studentName ? `Hello ${esc(studentName)},` : 'Hello,'}</p>
    <p>You have been issued an access code for your <strong>${esc(subjectName)}</strong> internal exam.</p>
    <p>Enter this code at the exam page to begin:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; font-family: 'Courier New', monospace; background: #f4f4f5; padding: 16px 24px; border-radius: 8px; display: inline-block;">${esc(code)}</p>
    <p>This code expires on <strong>${esc(expiry)} (UTC)</strong>.</p>
    <p>
      <a href="${esc(examUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">Go to exam</a>
    </p>
    <p style="color: #6b7280; font-size: 13px;">If the button does not work, copy and paste this link into your browser:<br />${esc(examUrl)}</p>
  </body>
</html>`

  const text = `${greeting}

You have been issued an access code for your ${subjectName} internal exam.

Enter this code at the exam page to begin:

  ${code}

This code expires on ${expiry} (UTC).

Go to the exam page: ${examUrl}`

  return { subject, html, text }
}
