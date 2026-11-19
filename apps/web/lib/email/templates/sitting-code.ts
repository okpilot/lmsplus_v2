import { EMAIL_COLOURS } from '@/lib/design/email-colours'
import { formatUtc } from '@/lib/utils/format-utc'
import { esc } from './internal-exam-code'

type SittingCodeEmailArgs = {
  studentName: string | null
  subjectName: string
  code: string
  scheduledAt: string
  mode: 'remote' | 'in_person'
  examUrl: string
}

const DATE = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
} as const

const MODE = { remote: 'Remote', in_person: 'In person' } as const

/**
 * Builds the sitting code email (subject/html/text). Pure; dates are UTC.
 * Inputs are server-trusted DB values.
 */
export function sittingCodeEmail({
  studentName,
  subjectName,
  code,
  scheduledAt,
  mode,
  examUrl,
}: SittingCodeEmailArgs): { subject: string; html: string; text: string } {
  const when = formatUtc(scheduledAt, DATE)
  const subject = `Your access code: ${subjectName} internal exam, ${when}`
  const entered = `You are entered for the ${subjectName} internal exam.`
  const sitting = `Sitting: ${when}, ${MODE[mode]}.`
  const rules =
    'The code works only while your invigilator has the sitting open, and not after the end of the sitting day (UTC). It can be used once. Keep this code to yourself.'

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: ${EMAIL_COLOURS.text}; line-height: 1.5;">
    <p>${studentName ? `Hello ${esc(studentName)},` : 'Hello,'}</p>
    <p>You are entered for the <strong style="font-weight: 600;">${esc(subjectName)}</strong> internal exam.</p>
    <p>${esc(sitting)}</p>
    <p>Your access code:</p>
    <p style="font-size: 28px; font-weight: 600; letter-spacing: 4px; background: ${EMAIL_COLOURS.surface}; padding: 16px 24px; border-radius: 8px; display: inline-block;">${esc(code)}</p>
    <p>${esc(rules)}</p>
    <p>
      <a href="${esc(examUrl)}" style="display: inline-block; background: ${EMAIL_COLOURS.accent}; color: ${EMAIL_COLOURS['on-accent']}; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">Go to exam</a>
    </p>
    <p style="color: ${EMAIL_COLOURS.muted}; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word;">If the button does not work, copy and paste this link into your browser:<br />${esc(examUrl)}</p>
  </body>
</html>`

  const text = `${studentName ? `Hello ${studentName},` : 'Hello,'}

${entered}
${sitting}

Your access code:

  ${code}

${rules}

Go to the exam page: ${examUrl}`

  return { subject, html, text }
}
