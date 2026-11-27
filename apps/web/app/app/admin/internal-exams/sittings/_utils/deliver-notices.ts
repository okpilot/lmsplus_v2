import { unstable_rethrow } from 'next/navigation'
import { sendEmailBatch } from '@/lib/email/resend'
import {
  entryRemovedEmail,
  sittingCancelledEmail,
  sittingChangedEmail,
} from '@/lib/email/templates/sitting-notice'
import {
  type ChangedNoticeCode,
  getDeliverablePendingNotices,
  getNoticeRecipients,
  getSittingForNotice,
  getSubjectNames,
  type PendingNotice,
  type Recipient,
  type UserClient,
} from '../../notice-queries'

type Mode = 'remote' | 'in_person'
type Sitting = { scheduledAt: string; mode: Mode }
type ChangedSitting = Sitting & { oldScheduledAt: string; oldMode: Mode }

export type NoticeResult = {
  sent: number
  failed: { studentName: string | null; subjectName?: string }[]
  skipped: number
  /** Sent, but the `notice_emailed` row failed: the next Send emails them again. */
  unrecorded: number
  /** A read or the app URL failed: some notices were not attempted. */
  error?: true
}

type Common = { supabase: UserClient; orgId: string; sittingId: string }
type DeliverArgs = Common &
  (
    | { kind: 'changed'; items: readonly ChangedNoticeCode[]; sitting: ChangedSitting }
    | { kind: PendingNotice['kind']; items: readonly PendingNotice[]; sitting: Sitting }
  )

/** The notices one email covers. */
export type NoticeGroup = {
  userId: string
  subjectIds: string[]
  codeIds: string[]
  entryIds: string[]
  passedAt: string | null
}

const RECORD_CHUNK = 50
const EMPTY: NoticeResult = { sent: 0, failed: [], skipped: 0, unrecorded: 0 }
const FAILED: NoticeResult = { ...EMPTY, error: true }

/** One group per student for change and cancellation notices, one per entry for a removal. */
export function groupNotices(items: readonly (ChangedNoticeCode | PendingNotice)[]): NoticeGroup[] {
  const groups = new Map<string, NoticeGroup>()
  for (const item of items) {
    const removal = 'kind' in item && item.kind === 'entry_auto_removed'
    const key = removal ? `entry:${item.entryId}` : `user:${item.userId}`
    const g = groups.get(key) ?? {
      userId: item.userId,
      subjectIds: [],
      codeIds: [],
      entryIds: [],
      passedAt: null,
    }
    if (!g.subjectIds.includes(item.subjectId)) g.subjectIds.push(item.subjectId)
    if ('codeId' in item) g.codeIds.push(item.codeId)
    if (removal) {
      g.entryIds.push(item.entryId)
      g.passedAt = item.passedAt
    }
    groups.set(key, g)
  }
  return [...groups.values()]
}

type Built = { to: string; subject: string; html: string; text: string }

function buildEmail(
  args: Pick<DeliverArgs, 'kind' | 'sitting'>,
  group: NoticeGroup,
  ctx: { to: Recipient; subjects: Map<string, string>; examUrl: string },
): Built {
  const names = group.subjectIds.map((id) => ctx.subjects.get(id) ?? 'Unknown subject')
  const studentName = ctx.to.name
  const { kind, sitting } = args
  let mail: Omit<Built, 'to'>
  if (kind === 'changed' && 'oldScheduledAt' in sitting) {
    mail = sittingChangedEmail({
      studentName,
      subjects: names,
      oldAt: sitting.oldScheduledAt,
      newAt: sitting.scheduledAt,
      oldMode: sitting.oldMode,
      newMode: sitting.mode,
      examUrl: ctx.examUrl,
    })
  } else if (kind === 'entry_auto_removed') {
    mail = entryRemovedEmail({
      studentName,
      subjectName: names[0] ?? 'Unknown subject',
      passedAt: group.passedAt ?? sitting.scheduledAt,
      scheduledAt: sitting.scheduledAt,
    })
  } else {
    mail = sittingCancelledEmail({ studentName, subjects: names, scheduledAt: sitting.scheduledAt })
  }
  return { to: ctx.to.email, ...mail }
}

function logRecordFailures(
  results: readonly PromiseSettledResult<{ error: { message: string } | null }>[],
  { sittingId, kind }: { sittingId: string; kind: string },
  groups: readonly NoticeGroup[],
): number {
  let failed = 0
  results.forEach((r, i) => {
    let message: string
    if (r.status === 'rejected') {
      message = r.reason instanceof Error ? r.reason.message : String(r.reason)
    } else if (r.value.error) {
      message = r.value.error.message
    } else {
      return
    }
    failed++
    const g = groups[i]
    const ids = kind === 'entry_auto_removed' ? g?.entryIds : g?.codeIds
    console.error('[deliverNotices] record failed', { sittingId, kind, ids }, message)
  })
  return failed
}

/** Records one `notice_emailed` row per covered id (user client); returns how many calls failed. */
async function record(
  { supabase, sittingId, kind }: Common & { kind: string },
  groups: readonly NoticeGroup[],
): Promise<number> {
  let failed = 0
  for (let i = 0; i < groups.length; i += RECORD_CHUNK) {
    const chunk = groups.slice(i, i + RECORD_CHUNK)
    const results = await Promise.allSettled(
      chunk.map((g) =>
        supabase.rpc('record_exam_sitting_notice', {
          p_sitting_id: sittingId,
          p_kind: kind,
          ...(kind === 'entry_auto_removed'
            ? { p_entry_ids: g.entryIds }
            : { p_code_ids: g.codeIds }),
        }),
      ),
    )
    failed += logRecordFailures(results, { sittingId, kind }, chunk)
  }
  return failed
}

async function send(messages: Built[]) {
  try {
    return await sendEmailBatch(messages)
  } catch (e) {
    console.error('[deliverNotices] send failed:', e instanceof Error ? e.message : String(e))
    return { sent: [], failed: messages.map((_, index) => ({ index, error: 'send_failed' })) }
  }
}

async function deliver(args: DeliverArgs, examUrl: string): Promise<NoticeResult> {
  const groups = groupNotices(args.items)
  const people = await getNoticeRecipients(
    args.orgId,
    groups.map((g) => g.userId),
  )
  const subjects = await getSubjectNames(groups.flatMap((g) => g.subjectIds))
  const deliverable = groups.filter((g) => people.has(g.userId))
  const messages = deliverable.map((g) =>
    buildEmail(args, g, { to: people.get(g.userId) as Recipient, subjects, examUrl }),
  )
  const { sent, failed } = await send(messages)
  const sentGroups = sent.flatMap((i) => deliverable[i] ?? [])
  const unrecorded = await record(args, sentGroups)
  return {
    sent: sent.length,
    failed: failed.map((f) => {
      const g = deliverable[f.index]
      const subjectId = args.kind === 'entry_auto_removed' ? g?.subjectIds[0] : undefined
      return {
        studentName: people.get(g?.userId ?? '')?.name ?? null,
        ...(subjectId ? { subjectName: subjects.get(subjectId) ?? 'Unknown subject' } : {}),
      }
    }),
    skipped: groups.length - deliverable.length,
    unrecorded,
  }
}

/** Emails the notices, then records each sent email. Logs failures; rethrows Next control-flow errors only. */
export async function deliverNotices(args: DeliverArgs): Promise<NoticeResult> {
  if (args.items.length === 0) return EMPTY
  const base = process.env.NEXT_PUBLIC_APP_URL
  // Only the change notice links to the app.
  if (!base && args.kind === 'changed') {
    console.error('[deliverNotices] NEXT_PUBLIC_APP_URL is not set')
    return FAILED
  }
  try {
    return await deliver(args, base ? `${base}/app/internal-exam` : '')
  } catch (e) {
    unstable_rethrow(e)
    console.error('[deliverNotices] failed:', e instanceof Error ? e.message : String(e))
    return FAILED
  }
}

function merge(a: NoticeResult, b: NoticeResult): NoticeResult {
  return {
    sent: a.sent + b.sent,
    failed: [...a.failed, ...b.failed],
    skipped: a.skipped + b.skipped,
    unrecorded: a.unrecorded + b.unrecorded,
    ...(a.error || b.error ? { error: true as const } : {}),
  }
}

/** Sends every deliverable pending removal and cancellation notice of the sitting. Rethrows Next control-flow errors only. */
export async function deliverPendingNotices(args: Common): Promise<NoticeResult> {
  try {
    const [sitting, items] = await Promise.all([
      getSittingForNotice(args.orgId, args.sittingId),
      getDeliverablePendingNotices(args.supabase, args.orgId, args.sittingId),
    ])
    if (items.length === 0) return EMPTY
    if (!sitting) return FAILED
    let total = EMPTY
    for (const kind of ['sitting_cancelled', 'entry_auto_removed'] as const) {
      const ofKind = items.filter((i) => i.kind === kind)
      if (ofKind.length > 0)
        total = merge(total, await deliverNotices({ ...args, kind, items: ofKind, sitting }))
    }
    return total
  } catch (e) {
    unstable_rethrow(e)
    console.error('[deliverPendingNotices] failed:', e instanceof Error ? e.message : String(e))
    return FAILED
  }
}
