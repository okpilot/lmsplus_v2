/**
 * VFR RT pool seed helper for red-team E2E specs (#873/#825).
 *
 * Seeds a VFR-RT-capable question pool (8 short_answer + 9 dialog_fill +
 * 8 multiple_choice, all in the globally-seeded RT subject, mig 097) plus an
 * enabled exam_configs row, so `start_vfr_rt_exam_session` succeeds in the
 * red-team environment. Success-path VFR-RT vectors (DN/DO/DQ/DR/DT etc.)
 * import this instead of admin-inserting raw sessions.
 *
 * Answers are UNIFORM per type — every short_answer's canonical is
 * VFR_RT_SA_ANSWER, every dialog_fill's blank-0 canonical is VFR_RT_DF_ANSWER,
 * every multiple_choice's key is VFR_RT_MC_CORRECT — so building a correct (or
 * deliberately Part-2-wrong) `p_answers` payload from the frozen question list
 * needs no per-question bookkeeping (see buildVfrRtAnswers).
 *
 * All seeded questions carry VFR_RT_POOL_MARKER at the start of question_text so
 * cleanupVfrRtPool can find them with a literal LIKE prefix (brackets are
 * literal in PostgreSQL LIKE — see restoreSeededQuestionsState in
 * helpers/supabase.ts).
 *
 * The RT subject + its three part-topics are shared reference data (mig 097):
 * resolve them by code, never create or delete them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Marker prefix used in `question_text` for pool-created questions.
 * Uses a hyphen, not an underscore: `_` is a single-char wildcard in SQL LIKE,
 * so `[E2E_VFRRT]%` would over-match in cleanupVfrRtPool. `[`, `]`, and `-` are
 * all literal in PostgreSQL LIKE, so this prefix matches exactly.
 */
export const VFR_RT_POOL_MARKER = '[E2E-VFRRT]'
/** Uniform canonical answer for every short_answer question in the pool. */
export const VFR_RT_SA_ANSWER = 'alpha'
/** Uniform blank-0 canonical answer for every dialog_fill question in the pool. */
export const VFR_RT_DF_ANSWER = 'S5-ABC'
/** Correct option id for every multiple_choice question in the pool. */
export const VFR_RT_MC_CORRECT = 'b'

// Per-type pool sizes. The exam samples these per part; total_questions is derived
// from their sum so the 8/9/8 counts and the exam_config total can't drift apart
// (a mismatch would make start_vfr_rt_exam_session silently under-draw).
export const VFR_RT_SA_COUNT = 8
export const VFR_RT_DF_COUNT = 9
export const VFR_RT_MC_COUNT = 8
export const VFR_RT_POOL_SIZE = VFR_RT_SA_COUNT + VFR_RT_DF_COUNT + VFR_RT_MC_COUNT
/** Canonical VFR-RT exam_config values — the single source of truth for the seed,
 * the normalize-on-reuse check, and the tests (avoids drift on 1800/75 literals). */
export const VFR_RT_TIME_LIMIT_SECONDS = 1800
export const VFR_RT_PASS_MARK = 75

type RtConfigSettings = {
  enabled: boolean
  total_questions: number
  time_limit_seconds: number
  pass_mark: number
}
type RtExamConfigResult = { id: string; created: boolean; prior?: RtConfigSettings }

export type VfrRtPool = {
  subjectId: string
  configId: string
  configCreated: boolean
  configPrior?: RtConfigSettings
  saIds: string[]
  dfIds: string[]
  mcIds: string[]
  allIds: string[]
}

type QuestionBase = {
  orgId: string
  bankId: string
  subjectId: string
  topicId: string
  createdBy: string
}

// ─── reference-data resolution (mig 097 — never created/deleted here) ─────────

/** Resolve the globally-seeded RT subject id by code (mig 097). */
async function resolveRtSubjectId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.from('easa_subjects').select('id').eq('code', 'RT').single()
  if (error || !data) throw new Error('resolveRtSubjectId: RT subject not found — run mig 097')
  return data.id as string
}

/** Resolve the RT subject id + its three part-topic ids by code (mig 097). */
async function resolveRtRefs(admin: SupabaseClient): Promise<{
  rtSubjectId: string
  p1TopicId: string
  p2TopicId: string
  p3TopicId: string
}> {
  const rtSubjectId = await resolveRtSubjectId(admin)
  const { data: topics, error } = await admin
    .from('easa_topics')
    .select('id, code')
    .eq('subject_id', rtSubjectId)
    .in('code', ['P1_ACRONYMS', 'P2_DIALOG', 'P3_MC'])
  if (error) throw new Error(`resolveRtRefs topics: ${error.message}`)
  const byCode = Object.fromEntries(
    (topics ?? []).map((t) => [(t as { code: string }).code, (t as { id: string }).id]),
  )
  if (!byCode.P1_ACRONYMS || !byCode.P2_DIALOG || !byCode.P3_MC)
    throw new Error('resolveRtRefs: one or more RT topics missing — run mig 097')
  return {
    rtSubjectId,
    p1TopicId: byCode.P1_ACRONYMS,
    p2TopicId: byCode.P2_DIALOG,
    p3TopicId: byCode.P3_MC,
  }
}

// ─── question bank + question rows ────────────────────────────────────────────

/** Reuse a non-deleted question_banks row for the org, else insert one. */
async function ensureBank(
  admin: SupabaseClient,
  orgId: string,
  adminUserId: string,
): Promise<string> {
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
    .insert({ organization_id: orgId, name: 'VFR RT Redteam Pool Bank', created_by: adminUserId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`ensureBank insert: ${error?.message}`)
  return data.id as string
}

function buildSaRows(base: QuestionBase): Record<string, unknown>[] {
  return Array.from({ length: VFR_RT_SA_COUNT }, (_, i) => ({
    organization_id: base.orgId,
    bank_id: base.bankId,
    subject_id: base.subjectId,
    topic_id: base.topicId,
    question_text: `${VFR_RT_POOL_MARKER} SA question ${i}?`,
    explanation_text: `SA explanation ${i}`,
    question_type: 'short_answer',
    canonical_answer: VFR_RT_SA_ANSWER,
    accepted_synonyms: [`${VFR_RT_SA_ANSWER}2`],
    options: [],
    blanks_config: [],
    difficulty: 'medium',
    status: 'active',
    created_by: base.createdBy,
  }))
}

function buildDfRows(base: QuestionBase): Record<string, unknown>[] {
  return Array.from({ length: VFR_RT_DF_COUNT }, (_, i) => ({
    organization_id: base.orgId,
    bank_id: base.bankId,
    subject_id: base.subjectId,
    topic_id: base.topicId,
    question_text: `${VFR_RT_POOL_MARKER} DF question ${i}?`,
    explanation_text: `DF explanation ${i}`,
    question_type: 'dialog_fill',
    dialog_template: `[atc] Cleared to land. {{0|${VFR_RT_DF_ANSWER};S5-XYZ}} report base.`,
    blanks_config: [{ index: 0, canonical: VFR_RT_DF_ANSWER, synonyms: ['S5-XYZ'] }],
    options: [],
    difficulty: 'medium',
    status: 'active',
    created_by: base.createdBy,
  }))
}

function buildMcRows(base: QuestionBase): Record<string, unknown>[] {
  return Array.from({ length: VFR_RT_MC_COUNT }, (_, i) => ({
    organization_id: base.orgId,
    bank_id: base.bankId,
    subject_id: base.subjectId,
    topic_id: base.topicId,
    question_text: `${VFR_RT_POOL_MARKER} MC question ${i}?`,
    explanation_text: `MC explanation ${i}`,
    question_type: 'multiple_choice',
    options: [
      { id: 'a', text: `Option A ${i}` },
      { id: 'b', text: `Option B ${i}` },
      { id: 'c', text: `Option C ${i}` },
      { id: 'd', text: `Option D ${i}` },
    ],
    // MC answer key in its own REVOKE-gated column (#823, mig 111).
    correct_option_id: VFR_RT_MC_CORRECT,
    blanks_config: [],
    difficulty: 'medium',
    status: 'active',
    created_by: base.createdBy,
  }))
}

/** Batch-insert question rows and return the created ids in insertion order. */
async function insertRows(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<string[]> {
  const { data, error } = await admin.from('questions').insert(rows).select('id')
  if (error) throw new Error(`seedVfrRtPool insert: ${error.message}`)
  // §5 cast-guard: verify every row is an object with a string id before mapping.
  if (
    !Array.isArray(data) ||
    !data.every(
      (r): r is { id: string } =>
        typeof r === 'object' && r !== null && typeof (r as { id?: unknown }).id === 'string',
    )
  ) {
    throw new Error('seedVfrRtPool insert: expected rows with string ids')
  }
  return data.map((r) => r.id)
}

// ─── exam_config (check-first, idempotent) ────────────────────────────────────

async function reselectRtExamConfig(
  admin: SupabaseClient,
  orgId: string,
  subjectId: string,
): Promise<RtExamConfigResult> {
  const { data: raced, error } = await admin
    .from('exam_configs')
    .select('id')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .single()
  if (error || !raced) throw new Error(`ensureRtExamConfig race reselect: ${error?.message}`)
  // Another seeder won the insert race — we did not create this row, and its
  // prior settings are unknown to us (we never read them), so omit `prior`.
  return { id: raced.id as string, created: false }
}

async function insertRtExamConfig(
  admin: SupabaseClient,
  orgId: string,
  subjectId: string,
): Promise<RtExamConfigResult> {
  const { data: created, error } = await admin
    .from('exam_configs')
    .insert({
      organization_id: orgId,
      subject_id: subjectId,
      enabled: true,
      total_questions: VFR_RT_POOL_SIZE,
      time_limit_seconds: VFR_RT_TIME_LIMIT_SECONDS,
      pass_mark: VFR_RT_PASS_MARK,
    })
    .select('id')
    .single()
  // Lost a check-then-insert race: the partial unique index
  // uq_exam_configs_org_subject_active (mig 044, WHERE deleted_at IS NULL)
  // rejects the duplicate. Re-read the row the winner created.
  if (error?.code === '23505') return reselectRtExamConfig(admin, orgId, subjectId)
  if (error || !created) throw new Error(`ensureRtExamConfig insert: ${error?.message}`)
  return { id: created.id as string, created: true }
}

/**
 * Ensure an enabled exam_configs row exists for (orgId, RT subject). Idempotent:
 * reuses/enables an existing non-deleted config, else inserts one. Handles the
 * partial-unique 23505 race. Returns the exam_config id plus whether this call
 * created the row (vs reused a pre-existing one) and — when reused — the prior
 * settings captured before normalization, so cleanup can restore instead of
 * soft-deleting a config it did not create.
 */
async function ensureRtExamConfig(
  admin: SupabaseClient,
  orgId: string,
  subjectId: string,
): Promise<RtExamConfigResult> {
  const { data: existing, error: lookupErr } = await admin
    .from('exam_configs')
    .select('id, enabled, total_questions, time_limit_seconds, pass_mark')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr) throw new Error(`ensureRtExamConfig lookup: ${lookupErr.message}`)
  if (!existing) return insertRtExamConfig(admin, orgId, subjectId)
  // Capture the pre-normalize settings BEFORE mutating, so cleanup can restore
  // them instead of soft-deleting a config this call did not create.
  const prior: RtConfigSettings = {
    enabled: existing.enabled === true,
    total_questions: Number(existing.total_questions),
    time_limit_seconds: Number(existing.time_limit_seconds),
    pass_mark: Number(existing.pass_mark),
  }
  // Normalize a reused config to the canonical VFR-RT settings. A row left over
  // from an earlier run (or another spec) may be disabled OR carry stale
  // total_questions / time_limit_seconds / pass_mark that would make
  // start_vfr_rt_exam_session under-draw or grade on a wrong pass mark. NUMERIC/
  // int columns may arrive as strings over the wire, so coerce with Number().
  const needsNormalize =
    existing.enabled !== true ||
    Number(existing.total_questions) !== VFR_RT_POOL_SIZE ||
    Number(existing.time_limit_seconds) !== VFR_RT_TIME_LIMIT_SECONDS ||
    Number(existing.pass_mark) !== VFR_RT_PASS_MARK
  if (needsNormalize) {
    // §5 zero-row guard: verify the update actually mutated a row (the config could
    // have been soft-deleted between the SELECT and this UPDATE).
    const { data: normalized, error: normalizeErr } = await admin
      .from('exam_configs')
      .update({
        enabled: true,
        total_questions: VFR_RT_POOL_SIZE,
        time_limit_seconds: VFR_RT_TIME_LIMIT_SECONDS,
        pass_mark: VFR_RT_PASS_MARK,
      })
      .eq('id', existing.id)
      .select('id')
    if (normalizeErr) throw new Error(`ensureRtExamConfig normalize: ${normalizeErr.message}`)
    if (!normalized?.length)
      throw new Error('ensureRtExamConfig normalize: config vanished mid-update')
  }
  return { id: existing.id as string, created: false, prior }
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Seed a VFR-RT question pool (8 SA + 9 DF + 8 MC) and an enabled exam_config
 * for the given org, all in the globally-seeded RT subject (mig 097). Idempotent
 * on the exam_config; questions are always inserted fresh (call cleanupVfrRtPool
 * first, or in an afterEach, to avoid accumulation across runs).
 */
export async function seedVfrRtPool(opts: {
  admin: SupabaseClient
  orgId: string
  adminUserId: string
}): Promise<VfrRtPool> {
  const { admin, orgId, adminUserId } = opts
  const refs = await resolveRtRefs(admin)
  const bankId = await ensureBank(admin, orgId, adminUserId)
  const base = { orgId, bankId, subjectId: refs.rtSubjectId, createdBy: adminUserId }
  const saIds = await insertRows(admin, buildSaRows({ ...base, topicId: refs.p1TopicId }))
  const dfIds = await insertRows(admin, buildDfRows({ ...base, topicId: refs.p2TopicId }))
  const mcIds = await insertRows(admin, buildMcRows({ ...base, topicId: refs.p3TopicId }))
  const config = await ensureRtExamConfig(admin, orgId, refs.rtSubjectId)
  return {
    subjectId: refs.rtSubjectId,
    configId: config.id,
    configCreated: config.created,
    configPrior: config.prior,
    saIds,
    dfIds,
    mcIds,
    allIds: [...saIds, ...dfIds, ...mcIds],
  }
}

// Restore a REUSED exam_config's prior settings on cleanup (rather than
// soft-deleting a row this pool did not create). §5 zero-row guard + log-on-mutation.
async function restoreExamConfig(opts: {
  admin: SupabaseClient
  configId?: string
  orgId: string
  rtSubjectId: string
  prior: RtConfigSettings
}): Promise<void> {
  const { admin, configId, orgId, rtSubjectId, prior } = opts
  let query = admin
    .from('exam_configs')
    .update({
      enabled: prior.enabled,
      total_questions: prior.total_questions,
      time_limit_seconds: prior.time_limit_seconds,
      pass_mark: prior.pass_mark,
    })
    .eq('organization_id', orgId)
    .eq('subject_id', rtSubjectId)
    .is('deleted_at', null)
  // E2E specs share the Supabase project — target the exact owned row when its id
  // is known so a delayed cleanup can't touch another spec's replacement config.
  if (configId) query = query.eq('id', configId)
  const { data, error } = await query.select('id')
  if (error) throw new Error(`cleanupVfrRtPool exam_config restore: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[cleanupVfrRtPool] restored ${data?.length} pre-existing exam_config(s)`)
  }
}

// Soft-delete the pool's own (created) exam_config, or the unknown-ownership
// dark-state fallback. §5 zero-row guard + log-on-mutation.
async function softDeleteExamConfig(opts: {
  admin: SupabaseClient
  configId?: string
  orgId: string
  rtSubjectId: string
  now: string
}): Promise<void> {
  const { admin, configId, orgId, rtSubjectId, now } = opts
  let query = admin
    .from('exam_configs')
    .update({ deleted_at: now })
    .eq('organization_id', orgId)
    .eq('subject_id', rtSubjectId)
    .is('deleted_at', null)
  // E2E specs share the Supabase project — target the exact owned row when its id
  // is known (created path); org+subject is the no-pool fallback only.
  if (configId) query = query.eq('id', configId)
  const { data, error } = await query.select('id')
  if (error) throw new Error(`cleanupVfrRtPool exam_config: ${error.message}`)
  if ((data?.length ?? 0) > 0) {
    console.log(`[cleanupVfrRtPool] soft-deleted ${data?.length} exam_config(s)`)
  }
}

/**
 * Soft-delete every pool-created question (by marker) and restore-or-remove the
 * org's RT exam_config. Two independent steps, each isolated in its own
 * try/catch so a failure in one never skips the other (code-style.md §7);
 * errors are accumulated and re-thrown as a single aggregated error. Zero
 * affected rows is a valid steady state — only log when a row actually
 * changed (§5).
 *
 * The exam_config step branches on ownership via `opts.pool` (from
 * seedVfrRtPool): if this pool CREATED the config, soft-delete it as before; if
 * it REUSED a pre-existing config, restore the captured prior settings instead
 * of soft-deleting a row it didn't create; if it reused via a lost 23505 race
 * (prior unknown), leave it untouched. When `pool` is omitted (or a beforeAll
 * failed before seeding), fall back to the original unconditional soft-delete.
 */
export async function cleanupVfrRtPool(opts: {
  admin: SupabaseClient
  orgId: string
  // configId optional: the lost-race call site passes only { configCreated: false }.
  pool?: Pick<VfrRtPool, 'configCreated' | 'configPrior'> & Partial<Pick<VfrRtPool, 'configId'>>
}): Promise<void> {
  const { admin, orgId, pool } = opts
  const errors: string[] = []
  const now = new Date().toISOString()

  // ── step 1: soft-delete pool questions (marker prefix) ──────────────────────
  try {
    const { data, error } = await admin
      .from('questions')
      .update({ deleted_at: now })
      .eq('organization_id', orgId)
      .like('question_text', `${VFR_RT_POOL_MARKER}%`)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`cleanupVfrRtPool questions: ${error.message}`)
    if ((data?.length ?? 0) > 0) {
      console.log(`[cleanupVfrRtPool] soft-deleted ${data?.length} pool question(s)`)
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  // ── step 2: restore or remove the org's RT exam_config based on ownership ──
  try {
    const created = pool?.configCreated
    const prior = pool?.configPrior
    const configId = pool?.configId
    if (created === false && !prior) {
      // Reused via a lost 23505 race — another seeder owns it; leave untouched.
      console.log('[cleanupVfrRtPool] exam_config reused via race — left untouched')
    } else {
      const rtSubjectId = await resolveRtSubjectId(admin)
      if (created === false && prior) {
        // Reused + normalized a pre-existing config — restore its prior settings
        // instead of soft-deleting a row we did not create.
        await restoreExamConfig({ admin, configId, orgId, rtSubjectId, prior })
      } else {
        // created === true (we created it) OR undefined (unknown ownership →
        // safe dark-state fallback): soft-delete.
        await softDeleteExamConfig({ admin, configId, orgId, rtSubjectId, now })
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  if (errors.length > 0) throw new Error(`cleanupVfrRtPool: ${errors.join('; ')}`)
}

/**
 * Build a valid `p_answers` payload for submit_vfr_rt_exam_answers from a
 * session's questions (as returned by get_vfr_rt_exam_questions). Each entry
 * carries only the fields the submit RPC's per-type validation allows
 * (mig 129): short_answer → response_text; dialog_fill → response_text +
 * blank_index; multiple_choice → selected_option_id. Uniform pool answers make
 * every entry correct by default.
 *
 * @param opts.failPart2 — when true, every dialog_fill answer is wrong (drives
 *   part2_pct to 0) while Part 1 (SA) and Part 3 (MC) stay correct.
 */
export function buildVfrRtAnswers(
  questions: Array<{ id: string; question_type: string }>,
  opts?: { failPart2?: boolean },
): Array<Record<string, unknown>> {
  const failPart2 = opts?.failPart2 ?? false
  const answers: Array<Record<string, unknown>> = []
  for (const q of questions) {
    if (q.question_type === 'short_answer') {
      answers.push({ question_id: q.id, response_text: VFR_RT_SA_ANSWER, response_time_ms: 1000 })
    } else if (q.question_type === 'dialog_fill') {
      answers.push({
        question_id: q.id,
        blank_index: 0,
        response_text: failPart2 ? 'WRONG' : VFR_RT_DF_ANSWER,
        response_time_ms: 1000,
      })
    } else if (q.question_type === 'multiple_choice') {
      answers.push({
        question_id: q.id,
        selected_option_id: VFR_RT_MC_CORRECT,
        response_time_ms: 1000,
      })
    } else {
      throw new Error(`buildVfrRtAnswers: unsupported question_type ${q.question_type}`)
    }
  }
  return answers
}
