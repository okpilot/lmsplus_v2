'use server'

import { AddSittingEntriesSchema, AddSittingExamsSchema } from '@repo/db/schema'
import { requireAdmin } from '@/lib/auth/require-admin'
import { MAX_PAIRS, tooManyPairsText } from '../_utils/popup-copy'
import { readUserNames } from '../people-lookup'
import { candidateIds } from '../people-queries'
import { readSkipped, type SkippedRow } from './read-skipped'
import {
  firstRow,
  num,
  revalidateSitting,
  type SittingActionResult,
  sittingFailure,
} from './sitting-action-result'

type SkippedPair = { person: string; subjectId: string; reason: string; detailAt?: string }
type Data = { added: number; skippedTotal: number; skipped: SkippedPair[] }

const SKIP_COUNTERS = [
  'skipped_attempt_running',
  'skipped_deactivated',
  'skipped_entered_elsewhere',
  'skipped_existing',
  'skipped_not_candidate',
  'skipped_not_enrolled',
  'skipped_passed',
] as const

/** Names are cosmetic: the entries are already written, so a failed read falls back to Unknown. */
async function namesOf(orgId: string, rows: readonly SkippedRow[]): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map()
  try {
    return await readUserNames(orgId, [...new Set(rows.map((r) => r.userId))])
  } catch {
    return new Map()
  }
}

/** Every person x exam pair, or the error to show when the pairs fail validation. */
function pairsOf(sittingId: string, users: readonly string[], subjectIds: readonly string[]) {
  const pairs = AddSittingEntriesSchema.safeParse({
    sittingId,
    userIds: users.flatMap((u) => subjectIds.map(() => u)),
    subjectIds: users.flatMap(() => subjectIds),
  })
  if (pairs.success) return { pairs: pairs.data }
  const tooMany = users.length * subjectIds.length > MAX_PAIRS
  return { error: tooMany ? tooManyPairsText(users.length, subjectIds.length) : 'Invalid input' }
}

function resultOf(row: Record<string, unknown>, skipped: SkippedRow[], names: Map<string, string>) {
  return {
    success: true as const,
    added: num(row, 'added'),
    skippedTotal: SKIP_COUNTERS.reduce((sum, k) => sum + num(row, k), 0),
    skipped: skipped.map((s) => ({
      person: names.get(s.userId) ?? 'Unknown',
      subjectId: s.subjectId,
      reason: s.reason,
      ...(s.detailAt ? { detailAt: s.detailAt } : {}),
    })),
  }
}

/** Adds every person x exam pair; blocked pairs are sent too and come back as skipped rows. */
export async function addSittingExams(input: unknown): Promise<SittingActionResult<Data>> {
  const parsed = AddSittingExamsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const { sittingId, subjectIds, userIds, all } = parsed.data
  const { supabase, organizationId } = await requireAdmin()
  const users = all ? await candidateIds(supabase, organizationId, { sittingId }) : (userIds ?? [])
  if (all && users.length === 0) return { success: false, error: 'No people in this sitting.' }
  const built = pairsOf(sittingId, users, subjectIds)
  if (!built.pairs) return { success: false, error: built.error }
  const { data, error } = await supabase.rpc('add_exam_sitting_entries', {
    p_sitting_id: sittingId,
    p_user_ids: built.pairs.userIds,
    p_subject_ids: built.pairs.subjectIds,
  })
  if (error) return sittingFailure(error.message, 'Failed to add exams')
  const row = firstRow(data)
  if (!row) return { success: false, error: 'Failed to add exams' }
  const skipped = readSkipped(row.skipped)
  const names = await namesOf(organizationId, skipped)
  revalidateSitting(sittingId)
  return resultOf(row, skipped, names)
}
