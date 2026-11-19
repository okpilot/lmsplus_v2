import { adminClient } from '@repo/db/admin'
import type { createServerSupabaseClient } from '@repo/db/server'

export type UserClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type Recipient = { name: string | null; email: string }

export type PendingNotice =
  | {
      kind: 'entry_auto_removed'
      entryId: string
      userId: string
      subjectId: string
      passedAt: string
    }
  | {
      kind: 'sitting_cancelled'
      codeId: string
      entryId: string
      userId: string
      subjectId: string
    }

export type ChangedNoticeCode = { codeId: string; userId: string; subjectId: string }

const CHUNK = 200

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

/**
 * Name and email of active users of `orgId` (service role: `users_select` is self-only; scoped by
 * `organization_id` and `id`). A deactivated or email-less user is absent from the map.
 */
export async function getNoticeRecipients(
  orgId: string,
  userIds: readonly string[],
): Promise<Map<string, Recipient>> {
  const out = new Map<string, Recipient>()
  for (const ids of chunks([...new Set(userIds)])) {
    const { data, error } = await adminClient
      .from('users')
      .select('id, full_name, email')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .in('id', ids)
    if (error) throw new Error(`notice recipients: ${error.message}`)
    for (const u of data ?? []) {
      if (u.email) out.set(u.id, { name: u.full_name || null, email: u.email })
    }
  }
  return out
}

/** Subject names by id (reference data, not tenant-scoped). */
export async function getSubjectNames(subjectIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const ids of chunks([...new Set(subjectIds)])) {
    const { data, error } = await adminClient.from('easa_subjects').select('id, name').in('id', ids)
    if (error) throw new Error(`subject names: ${error.message}`)
    for (const s of data ?? []) out.set(s.id, s.name)
  }
  return out
}

/** The live, unvoided, unconsumed codes among `codeIds` that belong to this sitting's live entries. */
export async function getChangedNoticeCodes(
  orgId: string,
  sittingId: string,
  codeIds: readonly string[],
): Promise<ChangedNoticeCode[]> {
  const out: ChangedNoticeCode[] = []
  for (const ids of chunks(codeIds)) {
    const { data, error } = await adminClient
      .from('internal_exam_codes')
      .select(
        'id, student_id, subject_id, exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id)',
      )
      .eq('organization_id', orgId)
      .eq('exam_sitting_entries.sitting_id', sittingId)
      .is('exam_sitting_entries.deleted_at', null)
      .is('deleted_at', null)
      .is('voided_at', null)
      .is('consumed_at', null)
      .in('id', ids)
    if (error) throw new Error(`changed notice codes: ${error.message}`)
    for (const c of data ?? [])
      out.push({ codeId: c.id, userId: c.student_id, subjectId: c.subject_id })
  }
  return out
}

/**
 * Time and mode of a sitting of `orgId`, cancelled (soft-deleted) ones included.
 * security.md §15 exception (g).
 */
export async function getSittingForNotice(
  orgId: string,
  sittingId: string,
): Promise<{ scheduledAt: string; mode: 'remote' | 'in_person' } | null> {
  const { data, error } = await adminClient
    .from('exam_sittings')
    .select('scheduled_at, mode')
    .eq('id', sittingId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`sitting for notice: ${error.message}`)
  if (!data) return null
  return {
    scheduledAt: data.scheduled_at,
    mode: data.mode === 'in_person' ? 'in_person' : 'remote',
  }
}

/**
 * Pending removal and cancellation notices of a sitting (user client: admin guard in the RPC),
 * without the ones whose student is deactivated or has no email. An unknown sitting gives [].
 */
export async function getDeliverablePendingNotices(
  supabase: UserClient,
  orgId: string,
  sittingId: string,
): Promise<PendingNotice[]> {
  const { data, error } = await supabase.rpc('get_pending_removal_notices', {
    p_sitting_id: sittingId,
  })
  if (error) {
    if (error.message.includes('sitting_not_found')) return []
    throw new Error(`pending notices: ${error.message}`)
  }
  const items: PendingNotice[] = (data ?? []).flatMap((r): PendingNotice[] => {
    if (r.kind === 'sitting_cancelled' && r.code_id) {
      return [
        {
          kind: r.kind,
          codeId: r.code_id,
          entryId: r.entry_id,
          userId: r.user_id,
          subjectId: r.subject_id,
        },
      ]
    }
    if (r.kind === 'entry_auto_removed') {
      return [
        {
          kind: r.kind,
          entryId: r.entry_id,
          userId: r.user_id,
          subjectId: r.subject_id,
          passedAt: r.passed_at,
        },
      ]
    }
    return []
  })
  const people = await getNoticeRecipients(
    orgId,
    items.map((i) => i.userId),
  )
  return items.filter((i) => people.has(i.userId))
}
