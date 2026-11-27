import { EMAIL_COLOURS } from '@/lib/design/email-colours'
import { formatUtc } from '@/lib/utils/format-utc'
import { esc } from './internal-exam-code'

type Mode = 'remote' | 'in_person'
type Email = { subject: string; html: string; text: string }

const DATE_TIME = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
} as const
const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const
const MODE: Record<Mode, string> = { remote: 'Remote', in_person: 'In person' }

type Link = { url: string; label: string }

/** Wraps paragraphs (plain strings, escaped here) in the shared notice layout; the text part mirrors them. */
function layout(studentName: string | null, lines: readonly string[], link?: Link): Email['html'] {
  const p = lines.map((l) => `    <p>${esc(l)}</p>`).join('\n')
  const button = link
    ? `
    <p>
      <a href="${esc(link.url)}" style="display: inline-block; background: ${EMAIL_COLOURS.accent}; color: ${EMAIL_COLOURS['on-accent']}; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">${esc(link.label)}</a>
    </p>
    <p style="color: ${EMAIL_COLOURS.muted}; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word;">If the button does not work, copy and paste this link into your browser:<br />${esc(link.url)}</p>`
    : ''
  return `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, Helvetica, sans-serif; color: ${EMAIL_COLOURS.text}; line-height: 1.5;">
    <p>${greeting(studentName, true)}</p>
${p}${button}
  </body>
</html>`
}

function greeting(studentName: string | null, escaped: boolean): string {
  if (!studentName) return 'Hello,'
  return `Hello ${escaped ? esc(studentName) : studentName},`
}

type Parts = { subject: string; studentName: string | null; lines: readonly string[]; link?: Link }

function build({ subject, studentName, lines, link }: Parts): Email {
  const text = [
    greeting(studentName, false),
    ...lines,
    ...(link ? [`Go to the exam page: ${link.url}`] : []),
  ].join('\n\n')
  return { subject, html: layout(studentName, lines, link), text }
}

type ChangedArgs = {
  studentName: string | null
  subjects: readonly string[]
  oldAt: string
  newAt: string
  oldMode: Mode
  newMode: Mode
  examUrl: string
}

/** Change notice: only the lines that changed. Pure; dates are UTC. */
export function sittingChangedEmail(a: ChangedArgs): Email {
  const lines = [`Your internal exam sitting for ${a.subjects.join(', ')} has changed.`]
  if (a.newAt !== a.oldAt) {
    lines.push(`New time: ${formatUtc(a.newAt, DATE_TIME)} (was ${formatUtc(a.oldAt, DATE_TIME)}).`)
  }
  if (a.newMode !== a.oldMode) {
    lines.push(`Mode: ${MODE[a.newMode]} (was ${MODE[a.oldMode]}).`)
  }
  lines.push('Your access codes stay the same.')
  return build({
    subject: `Change to your internal exam sitting on ${formatUtc(a.oldAt, DAY)}`,
    studentName: a.studentName,
    lines,
    link: { url: a.examUrl, label: 'Go to exam' },
  })
}

type CancelledArgs = {
  studentName: string | null
  subjects: readonly string[]
  scheduledAt: string
}

/** Cancellation notice for a sitting. No code values, no exam link. */
export function sittingCancelledEmail(a: CancelledArgs): Email {
  const when = formatUtc(a.scheduledAt, DAY)
  return build({
    subject: `Cancelled: your internal exam sitting on ${when}`,
    studentName: a.studentName,
    lines: [
      `Your internal exam sitting for ${a.subjects.join(', ')} on ${when} has been cancelled.`,
      'Your access codes no longer work.',
      'Your school will arrange a new sitting.',
    ],
  })
}

type RemovedArgs = {
  studentName: string | null
  subjectName: string
  passedAt: string
  scheduledAt: string
}

/** Notice that a student who passed the subject was removed from the sitting. */
export function entryRemovedEmail(a: RemovedArgs): Email {
  return build({
    subject: `Removed from internal exam sitting: ${a.subjectName}`,
    studentName: a.studentName,
    lines: [
      `You passed the ${a.subjectName} internal exam on ${formatUtc(a.passedAt, DAY)}, so you have been removed from the sitting on ${formatUtc(a.scheduledAt, DAY)}.`,
      'Any access code you had for it no longer works.',
    ],
  })
}
