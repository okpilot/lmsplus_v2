/**
 * Shared fixtures for the VFR RT exam integration suites.
 *
 * Extracted from rpc-vfr-rt-start.integration.test.ts (#844) so the start,
 * questions, and column-grant test files can each stay under the 500-line
 * ceiling without duplicating these five seed helpers. Not a test file
 * (no .test.ts suffix) — Vitest does not collect it.
 *
 * `admin` and `suffix` are module-level: each importing test file loads this
 * module in its own Vitest worker, so each file gets its own `Date.now()`
 * suffix. That is safe because every describe block already uses a distinct
 * org-slug / email prefix, so cross-file slug/email collisions cannot occur.
 */
import { getAdminClient } from './setup'

export const admin = getAdminClient()
export const suffix = Date.now()

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Insert a minimal short_answer question owned by the test org into the RT subject. */
export async function insertShortAnswerQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p1TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p1TopicId,
      question_text: `SA question ${opts.idx} ${suffix}?`,
      explanation_text: `SA explanation ${opts.idx}`,
      question_type: 'short_answer',
      canonical_answer: `answer_${opts.idx}`,
      accepted_synonyms: [`syn_${opts.idx}`, `syn_${opts.idx}b`],
      options: [],
      blanks_config: [],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertShortAnswerQuestion: ${error.message}`)
  return data.id as string
}

/** Insert a minimal dialog_fill question. blanks_config must be non-empty array. */
export async function insertDialogFillQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p2TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p2TopicId,
      question_text: `DF question ${opts.idx} ${suffix}?`,
      explanation_text: `DF explanation ${opts.idx}`,
      question_type: 'dialog_fill',
      dialog_template: `[atc] Cleared to land runway 28. {{0|S5-ABC;S5-XYZ}} report base.`,
      blanks_config: [{ index: 0, canonical: 'S5-ABC', synonyms: ['S5-XYZ'] }],
      options: [],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertDialogFillQuestion: ${error.message}`)
  return data.id as string
}

/** Insert a minimal multiple_choice question into the RT subject. */
export async function insertMcQuestion(opts: {
  orgId: string
  bankId: string
  adminId: string
  rtSubjectId: string
  p3TopicId: string
  idx: number
}): Promise<string> {
  const { data, error } = await admin
    .from('questions')
    .insert({
      organization_id: opts.orgId,
      bank_id: opts.bankId,
      subject_id: opts.rtSubjectId,
      topic_id: opts.p3TopicId,
      question_text: `MC question ${opts.idx} ${suffix}?`,
      explanation_text: `MC explanation ${opts.idx}`,
      question_type: 'multiple_choice',
      options: [
        { id: 'a', text: `Option A ${opts.idx}`, correct: false },
        { id: 'b', text: `Option B ${opts.idx}`, correct: true },
        { id: 'c', text: `Option C ${opts.idx}`, correct: false },
        { id: 'd', text: `Option D ${opts.idx}`, correct: false },
      ],
      difficulty: 'medium',
      status: 'active',
      created_by: opts.adminId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insertMcQuestion: ${error.message}`)
  return data.id as string
}

/** Resolve the RT subject id and its three part-topic ids from the seeded mig 097 data. */
export async function getRtRefs(): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const { data: sub, error: subErr } = await admin
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()
  if (subErr || !sub) throw new Error(`getRtRefs: RT subject not found — run mig 097`)

  const { data: topics, error: topErr } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', sub.id)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (topErr) throw new Error(`getRtRefs: ${topErr.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t: { id: string; code: string }) => [t.code, t.id]),
  )
  if (!byCode.P1_ACRONYMS || !byCode.P2_DIALOG || !byCode.P3_MC)
    throw new Error('getRtRefs: one or more RT topics missing — run mig 097')
  return {
    rtSubjectId: sub.id,
    p1TopicId: byCode.P1_ACRONYMS,
    p2TopicId: byCode.P2_DIALOG,
    p3TopicId: byCode.P3_MC,
  }
}

/** Ensure a question_banks row exists for the org and return its id. */
export async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const { data: existing, error: lookupErr } = await admin
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureBank lookup: ${lookupErr.message}`)
  if (existing) return existing.id as string
  const { data, error } = await admin
    .from('question_banks')
    .insert({ organization_id: orgId, name: `RT Test Bank ${suffix}`, created_by: adminId })
    .select('id')
    .single()
  if (error) throw new Error(`ensureBank insert: ${error.message}`)
  return data.id as string
}
