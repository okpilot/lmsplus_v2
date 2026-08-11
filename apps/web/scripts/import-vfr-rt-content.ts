/**
 * Importer for curated VFR RT question content (Parts 1–3).
 *
 * Reads one or more content JSON files (see scripts/content/vfr-rt-*.json) and
 * inserts the corresponding `questions` rows. Insert-only + idempotent: a question
 * already present (matched by bank_id + question_number) is skipped, never mutated.
 *
 * Local (default): bootstraps the shared eval org + admin/student logins + bank so
 * you can drill the content at /app/vfr-rt immediately.
 * Remote (--force-remote): looks up the target org + an existing admin (created_by)
 * and the bank; never creates auth users. Refuses non-local URLs without the flag.
 *
 * --replace (LOCAL ONLY): soft-delete the file's existing questions before inserting, so an
 * edited content file actually takes effect. Refused outright with --force-remote, and refused
 * unless the target URL's HOST is this machine (isLocalSupabaseUrl — a stricter check than the
 * prefix match above, which reads `http://localhost.example.com` as local).
 *
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/import-vfr-rt-content.ts                       # imports Part 1 locally
 *   npx tsx scripts/import-vfr-rt-content.ts content/foo.json bar.json
 *   npx tsx scripts/import-vfr-rt-content.ts --force-remote        # prod (needs existing org+admin)
 *   npx tsx scripts/import-vfr-rt-content.ts scripts/content/foo.json --replace   # local re-import
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { isLocalSupabaseUrl, requireRecord, requireText } from './content-assertions'
import {
  assertDialogFillAuthoring,
  assertDialogFillItem,
  composeDialogTemplate,
  type DialogFillItem,
  toStoredBlanks,
} from './dialog-fill-content'

config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const FORCE_REMOTE = process.argv.includes('--force-remote')
const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !FORCE_REMOTE) {
  console.error(
    `Refusing to import against non-local Supabase URL: ${SUPABASE_URL}\nPass --force-remote to override.`,
  )
  process.exit(1)
}

// --replace soft-deletes existing rows, so it is gated harder than the import itself and its
// gates run HERE, at module load: the process exits before createClient below and therefore
// before resolveOrgId / resolveAdminId / ensureBank perform any write.
const REPLACE = process.argv.includes('--replace')
// Independent of --force-remote by design: that flag bypasses the refusal above only, and must
// never unlock a destructive re-import. Rejected before the URL is even considered.
if (REPLACE && FORCE_REMOTE) {
  console.error('--replace is local-only and cannot be combined with --force-remote.')
  process.exit(1)
}
if (REPLACE && !isLocalSupabaseUrl(SUPABASE_URL)) {
  console.error(`Refusing --replace against a non-local Supabase URL: ${SUPABASE_URL}`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Shared with the eval seeds so the same local login works everywhere.
const ORG_SLUG = 'egmont-aviation'
const ORG_NAME = 'Egmont Aviation'
const BANK_NAME = 'VFR RT QDB'
const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

// ---- content shape -----------------------------------------------------------

type ShortAnswerItem = {
  num: string
  prompt: string
  canonical: string
  synonyms: string[]
  acronym?: string
  explanation?: string
}
type McItem = {
  num: string
  prompt: string
  options: { id: string; text: string }[]
  correct: string
  explanation?: string
}

type ContentFile = {
  title: string
  subject_code: string
  topic_code: string
  question_type: 'short_answer' | 'multiple_choice' | 'dialog_fill'
  // OPTIONAL — Part 1 has no `status` key at all, and Part 1 is the default target (see main()),
  // i.e. the path that reached production. Every read of it must typeof-guard first.
  status?: string
  questions: (ShortAnswerItem | McItem | DialogFillItem)[]
}

// ---- bootstrap helpers -------------------------------------------------------

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id
  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

async function ensureUserRow(
  id: string,
  orgId: string,
  email: string,
  role: 'admin' | 'student',
): Promise<void> {
  const { error } = await db.from('users').upsert(
    {
      id,
      organization_id: orgId,
      email,
      full_name: role === 'admin' ? 'Admin User' : 'Student User',
      role,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`User row ${email}: ${error.message}`)
}

async function resolveOrgId(): Promise<string> {
  if (FORCE_REMOTE) {
    const { data, error } = await db
      .from('organizations')
      .select('id')
      .eq('slug', ORG_SLUG)
      .single()
    if (error || !data) throw new Error(`Org '${ORG_SLUG}' not found on remote: ${error?.message}`)
    return data.id
  }
  const { data, error } = await db
    .from('organizations')
    .upsert({ name: ORG_NAME, slug: ORG_SLUG }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Org upsert: ${error?.message}`)
  return data.id
}

async function resolveAdminId(orgId: string): Promise<string> {
  if (FORCE_REMOTE) {
    const { data, error } = await db
      .from('users')
      .select('id')
      .eq('organization_id', orgId)
      .eq('role', 'admin')
      .is('deleted_at', null)
      .limit(1)
      .single()
    if (error || !data) throw new Error(`No admin in org for created_by: ${error?.message}`)
    return data.id
  }
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUserRow(adminId, orgId, ADMIN_EMAIL, 'admin')
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUserRow(studentId, orgId, STUDENT_EMAIL, 'student')
  return adminId
}

async function ensureBank(orgId: string, adminId: string): Promise<{ id: string; name: string }> {
  // One bank per org (question_banks_organization_id_key) — reuse whatever bank the org
  // already has REGARDLESS OF NAME. Filtering on name here would miss an existing bank
  // named differently (prod's org holds "EASA PPL(A) QDB") and fall through to an INSERT
  // that hits the UNIQUE(organization_id) constraint with a 23505. A soft-deleted bank is
  // restored, since that UNIQUE covers deleted rows too. BANK_NAME applies on first insert
  // only. Local bootstraps (restore/create) as seed-vfr-rt-training-eval.ts:317 does;
  // --force-remote is lookup-or-throw, like the two resolvers above.
  const { data: existing, error: lookupErr } = await db
    .from('question_banks')
    .select('id, name, deleted_at')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (lookupErr) throw new Error(`Bank lookup: ${lookupErr.message}`)
  if (existing) {
    if (existing.deleted_at !== null) {
      // Remote is lookup-only, matching resolveOrgId/resolveAdminId above: a soft-deleted
      // prod bank can only be the result of a deliberate manual act, so the operator
      // decides whether to revive it (same stance as import-questions.ts:147).
      if (FORCE_REMOTE) {
        throw new Error(
          `Org bank "${existing.name}" (${existing.id}) is soft-deleted — restore it manually before importing.`,
        )
      }
      const { data: restored, error: restoreErr } = await db
        .from('question_banks')
        .update({ deleted_at: null, deleted_by: null })
        .eq('id', existing.id)
        .select('id')
      if (restoreErr) throw new Error(`Bank restore: ${restoreErr.message}`)
      if (!restored?.length) throw new Error('Bank restore: no rows updated')
    }
    return { id: existing.id, name: existing.name }
  }
  if (FORCE_REMOTE) {
    throw new Error(
      `No question bank for org ${orgId} on remote — create it deliberately before importing.`,
    )
  }
  const { data, error } = await db
    .from('question_banks')
    .insert({ organization_id: orgId, name: BANK_NAME, created_by: adminId })
    .select('id, name')
    .single()
  if (error || !data) throw new Error(`Bank: ${error?.message}`)
  return { id: data.id, name: data.name }
}

async function lookupSubjectByCode(code: string): Promise<string> {
  // easa_subjects.code is globally UNIQUE (mig 20260311000001), so a bare code is exact.
  const { data, error } = await db.from('easa_subjects').select('id').eq('code', code).single()
  if (error || !data)
    throw new Error(`easa_subjects code='${code}': ${error?.message ?? 'not found'}`)
  return data.id
}

async function lookupTopicByCode(subjectId: string, code: string): Promise<string> {
  // easa_topics is UNIQUE (subject_id, code) — NOT unique on code alone — so the lookup
  // must be subject-scoped or it can resolve another subject's identically-coded topic.
  // Same shape as import-questions.ts:234. A wrong topic_id inserts cleanly (subject_id and
  // topic_id are independent FKs with no cross-consistency CHECK) and the row is then
  // invisible to every sampler, since all of them pin subject AND topic.
  const { data, error } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', subjectId)
    .eq('code', code)
    .single()
  if (error || !data)
    throw new Error(
      `easa_topics code='${code}' under subject ${subjectId}: ${error?.message ?? 'not found'}`,
    )
  return data.id
}

// ---- content validation --------------------------------------------------------

// questions_mc_correct_option_id_check constrains correct_option_id to exactly these.
const MC_OPTION_IDS = ['a', 'b', 'c', 'd']

// The types buildRow has a branch for. Widen both together when adding ordering / diagram_label —
// the DB accepts all five (questions_question_type_check).
const SUPPORTED_TYPES = ['short_answer', 'multiple_choice', 'dialog_fill']

function validateShortAnswerItem(sa: ShortAnswerItem, at: string): void {
  requireText(sa.canonical, `${at} (${sa.num}): 'canonical'`)
  // Not written directly, but interpolated into the fallback explanation, where a
  // non-string would render as "[object Object]: <canonical>".
  if (sa.acronym !== undefined) {
    requireText(sa.acronym, `${at} (${sa.num}): 'acronym'`)
  }
  if (sa.synonyms !== undefined && !Array.isArray(sa.synonyms)) {
    throw new Error(`${at} (${sa.num}): 'synonyms' must be an array when present`)
  }
  // accepted_synonyms is TEXT[], which happily stores a NULL or blank element — it would
  // just never match anything the grader normalizes, so it fails silently at answer time.
  for (const [j, synonym] of (sa.synonyms ?? []).entries()) {
    requireText(synonym, `${at} (${sa.num}): synonyms[${j}]`)
  }
}

function validateMcItem(mc: McItem, at: string): void {
  if (!Array.isArray(mc.options) || mc.options.length === 0) {
    throw new Error(`${at} (${mc.num}): 'options' must be a non-empty array`)
  }
  // The DB CHECK only constrains correct_option_id to 'a'..'d'; nothing enforces that it
  // names an option that actually exists, and trg_sanitize_question_options rewrites each
  // element to {id,text}, silently emitting nulls for a malformed one. Both would import
  // clean and render un-answerable, so check the mapping here.
  if (!MC_OPTION_IDS.includes(mc.correct)) {
    throw new Error(
      `${at} (${mc.num}): 'correct' must be one of ${MC_OPTION_IDS.join('/')} (got ${JSON.stringify(mc.correct)})`,
    )
  }
  const optionIds = new Set<string>()
  for (const [j, opt] of mc.options.entries()) {
    requireText(opt?.id, `${at} (${mc.num}): options[${j}].id`)
    requireText(opt?.text, `${at} (${mc.num}): options[${j}].text`)
    // A duplicate id makes `correct` ambiguous and the runner's option lookup arbitrary.
    if (optionIds.has(opt.id)) {
      throw new Error(`${at} (${mc.num}): duplicate option id '${opt.id}'`)
    }
    optionIds.add(opt.id)
  }
  if (!mc.options.some((o) => o.id === mc.correct)) {
    throw new Error(`${at} (${mc.num}): 'correct' is '${mc.correct}' but no option carries that id`)
  }
}

// ---- row building ------------------------------------------------------------

type QuestionRow = Record<string, unknown> & { question_number: string }

function buildRow(
  file: ContentFile,
  q: ShortAnswerItem | McItem | DialogFillItem,
  base: Record<string, unknown>,
  topicId: string,
): QuestionRow {
  // `common` already satisfies every questions_question_type_columns_check discriminator: five
  // are set explicitly below, and diagram_config by OMISSION — the column defaults to NULL
  // (ADD COLUMN diagram_config JSONB NULL DEFAULT NULL). Whoever widens this to diagram_label
  // must set it here rather than assume the default still applies.
  const common = {
    ...base,
    topic_id: topicId,
    question_number: q.num,
    question_text: q.prompt,
    question_type: file.question_type,
    options: [],
    canonical_answer: null,
    accepted_synonyms: [],
    dialog_template: null,
    blanks_config: [],
    ordering_items: [],
    correct_option_id: null,
  }
  if (file.question_type === 'short_answer') {
    const sa = q as ShortAnswerItem
    return {
      ...common,
      canonical_answer: sa.canonical,
      accepted_synonyms: sa.synonyms ?? [],
      explanation_text:
        sa.explanation ??
        (sa.acronym ? `${sa.acronym}: ${sa.canonical}` : (base.explanation_text as string)),
    }
  }
  if (file.question_type === 'multiple_choice') {
    const mc = q as McItem
    return {
      ...common,
      options: mc.options,
      correct_option_id: mc.correct,
      explanation_text: mc.explanation ?? (base.explanation_text as string),
    }
  }
  if (file.question_type === 'dialog_fill') {
    // Narrow instead of casting: this branch reads a nested structure, and the assertion is the
    // same one Stage B ran, so a shape drift here is a bug in the loop, not a silent bad row.
    const label = `question '${q.num}'`
    assertDialogFillItem(q, label)
    const blanks = toStoredBlanks(q.blanks)
    return {
      ...common,
      dialog_template: composeDialogTemplate(q.template, blanks, label),
      blanks_config: blanks,
      // `common` spreads `base`, so it already carries an `explanation_text` — the GENERIC
      // fallback. Every branch must re-resolve the authored value or the teaching note is
      // silently replaced by that boilerplate: the column is NOT NULL and `base` satisfies it,
      // so nothing fails and it surfaces only at eval.
      explanation_text: q.explanation ?? (base.explanation_text as string),
    }
  }
  throw new Error(`Unsupported question_type '${file.question_type}' (add a branch in buildRow)`)
}

/**
 * Soft-delete the rows this file is about to re-insert (--replace only, local only). The
 * importer is otherwise insert-only, so an edited question has no effect on re-run.
 *
 * Scoped to bank + topic + question_type + the file's own `num` set. There is exactly one bank
 * per organization, so locally that bank also holds Part 1 and everything the eval seeds
 * insert; num-only scoping is safe today only because VRT-P2-DLG-* happens to be distinctive.
 * Never a hard DELETE — and idx_questions_bank_number is UNIQUE (bank_id, question_number)
 * WHERE deleted_at IS NULL, so the soft delete correctly frees the slot for re-insert.
 */
type ReplaceScope = {
  rel: string
  bankId: string
  topicId: string
  questionType: string
  nums: string[]
}

async function softDeleteForReplace(scope: ReplaceScope, adminId: string): Promise<void> {
  const { data: matched, error: matchErr } = await db
    .from('questions')
    .select('question_number')
    .eq('bank_id', scope.bankId)
    .eq('topic_id', scope.topicId)
    .eq('question_type', scope.questionType)
    .in('question_number', scope.nums)
    .is('deleted_at', null)
  if (matchErr) throw new Error(`--replace lookup (${scope.rel}): ${matchErr.message}`)
  if (!matched || matched.length === 0) {
    // Name the discriminators: if the file's topic_code or question_type changed since the rows
    // were imported, the old rows carry the OLD values and match nothing here, while
    // insertIfMissing (bank + number only) then skips every num — so the edit silently does not
    // take effect, which is exactly what --replace exists to prevent.
    console.log(
      `  ${scope.rel}: --replace matched no existing rows (type=${scope.questionType}, topic=${scope.topicId})`,
    )
    return
  }
  // Disclosure, not detection: a hostname check cannot see through an SSH tunnel, so print the
  // target and exactly what is about to be soft-deleted before mutating.
  console.log(
    `  ${scope.rel}: --replace soft-deleting ${matched.length} row(s) on ${SUPABASE_URL} — ${matched.map((r) => r.question_number).join(', ')}`,
  )
  // ensureBank's restore path clears deleted_at and deleted_by together, so stamp both here.
  const { data: removed, error } = await db
    .from('questions')
    .update({ deleted_at: new Date().toISOString(), deleted_by: adminId })
    .eq('bank_id', scope.bankId)
    .eq('topic_id', scope.topicId)
    .eq('question_type', scope.questionType)
    .in('question_number', scope.nums)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`--replace soft-delete (${scope.rel}): ${error.message}`)
  // code-style §5's "log only when > 0" shape is for cleanup where zero rows is VALID. Here the
  // SELECT above already proved N rows match, so anything less than N means the write was blocked
  // (RLS/grant — see #815) or the rows moved. Throw rather than warn: the insert loop that follows
  // would find the rows still live, skip all of them, and print `0 inserted / N skipped`, which is
  // indistinguishable from a successful idempotent re-run. A silent no-op is the one outcome
  // --replace must never produce.
  const removedCount = removed?.length ?? 0
  if (removedCount !== matched.length) {
    throw new Error(
      `--replace soft-delete (${scope.rel}): matched ${matched.length} row(s) but updated ${removedCount} — the write was blocked or the rows moved; aborting before re-insert.`,
    )
  }
  console.log(`  ${scope.rel}: --replace soft-deleted ${removedCount} row(s)`)
}

async function insertIfMissing(bankId: string, row: QuestionRow): Promise<boolean> {
  const { data: existing, error: existingErr } = await db
    .from('questions')
    .select('id')
    .eq('bank_id', bankId)
    .eq('question_number', row.question_number)
    .is('deleted_at', null)
    .limit(1)
  if (existingErr) throw new Error(`Question ${row.question_number} lookup: ${existingErr.message}`)
  if (existing && existing.length > 0) return false
  const { error } = await db.from('questions').insert(row)
  if (error) throw new Error(`Question ${row.question_number}: ${error.message}`)
  return true
}

// ---- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const targets = files.length > 0 ? files : ['scripts/content/vfr-rt-part1-acronyms.json']

  // Parse + validate every field this importer writes, across ALL files, BEFORE touching the
  // DB. Inserts are row-at-a-time and individually committed (no transaction), so a malformed
  // item found at INSERT time leaves earlier rows already written; validating up front turns
  // that half-import into a clean abort.
  //
  // Keep this in step with buildRow — a field buildRow writes but this loop does not check is
  // a field that fails mid-run. The full set buildRow reads from content today: file-level
  // `subject_code`/`topic_code`/`question_type`; per-item `num`, `prompt`, `explanation`;
  // short_answer `canonical`, `synonyms`, `acronym`; multiple_choice `options`, `correct`;
  // dialog_fill `template`, `blanks` (validated by assertDialogFillItem, which mirrors the DB
  // CHECKs, plus assertDialogFillAuthoring for the house blank-shape rules). Everything else it
  // writes is a literal or comes from `base`. When you add a buildRow branch (ordering /
  // diagram_label), extend the per-type dispatch below in the same commit — its `default` arm
  // is what turns "no validator yet" into a named abort instead of a misleading MC error.
  //
  // `num` gets the strictest treatment because it is the idempotency key: non-empty string and
  // unique across ALL loaded files (they share one bank). A missing/non-string `num` would
  // otherwise reach the INSERT as question_number NULL, which idx_questions_bank_number
  // (UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL AND question_number IS NOT NULL)
  // exempts — so the row would silently re-insert a duplicate on every re-run.
  const parsed = targets.map((rel) => {
    // readFileSync already names the path in its ENOENT message; JSON.parse's SyntaxError does
    // not, and with several target files the operator cannot tell which one failed.
    const text = readFileSync(resolve(process.cwd(), rel), 'utf8')
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (err) {
      throw new Error(`${rel}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`)
    }
    requireRecord(raw, `${rel}: root`)
    const file = raw as unknown as ContentFile
    requireText(file.subject_code, `${rel}: 'subject_code'`)
    requireText(file.topic_code, `${rel}: 'topic_code'`)
    // Not read by buildRow — it is interpolated into the per-file completion summary, so it is
    // the one content field outside the buildRow parity contract described below. Unvalidated,
    // a missing or object-valued title prints `undefined` / `[object Object]` in the summary.
    requireText(file.title, `${rel}: 'title'`)
    // buildRow throws on an unsupported type, but only once it reaches that item mid-loop.
    if (!SUPPORTED_TYPES.includes(file.question_type)) {
      throw new Error(
        `${rel}: unsupported question_type ${JSON.stringify(file.question_type)} — this importer handles ${SUPPORTED_TYPES.join('/')}; add a buildRow branch first`,
      )
    }
    // Importing makes rows immediately exam-eligible on the target DB, so a file that declares
    // itself a pilot batch is the one thing --force-remote must not carry to prod. `status` is
    // OPTIONAL and absent from Part 1 — the default target — so typeof-guard before .startsWith,
    // or the prod import path throws a bare TypeError.
    if (FORCE_REMOTE && typeof file.status === 'string' && file.status.startsWith('PILOT')) {
      throw new Error(
        `${rel}: refusing --force-remote — the file declares status ${JSON.stringify(file.status)}`,
      )
    }
    if (!Array.isArray(file.questions) || file.questions.length === 0) {
      throw new Error(`${rel}: 'questions' must be a non-empty array`)
    }
    return { rel, file }
  })

  const seenNums = new Map<string, string>()
  for (const { rel, file } of parsed) {
    for (const [i, q] of file.questions.entries()) {
      const at = `${rel}[${i}]`
      requireRecord(q, at)
      requireText(q.num, `${at}: 'num'`)
      const prior = seenNums.get(q.num)
      if (prior)
        throw new Error(`Duplicate num '${q.num}' in ${rel} — already declared in ${prior}`)
      seenNums.set(q.num, rel)

      requireText(q.prompt, `${at} (${q.num}): 'prompt'`)
      // Optional on both branches. `buildRow` resolves it with `??`, which only catches
      // null/undefined — so `explanation: ""` would write an empty explanation_text rather
      // than falling back to the generic one. Present means non-blank.
      if (q.explanation !== undefined) {
        requireText(q.explanation, `${at} (${q.num}): 'explanation'`)
      }
      // Exhaustive by type, with a throwing default. The previous shape was
      // `if (short_answer) {…} else {…}` where the else was NOT guarded on multiple_choice, so
      // a third type fell into the MC validator and failed with a nonsense
      // "'options' must be a non-empty array". The default arm is redundant with the
      // SUPPORTED_TYPES gate above BY DESIGN — it is the structural guard whose absence was
      // the bug, and it holds even if the two lists drift apart.
      switch (file.question_type) {
        case 'short_answer':
          validateShortAnswerItem(q as ShortAnswerItem, at)
          break
        case 'multiple_choice':
          validateMcItem(q as McItem, at)
          break
        case 'dialog_fill': {
          const label = `${at} (${q.num})`
          assertDialogFillItem(q, label)
          assertDialogFillAuthoring(q, label)
          break
        }
        default:
          throw new Error(
            `${at}: no per-item validator for question_type ${JSON.stringify(file.question_type)} — add one alongside the buildRow branch`,
          )
      }
    }
  }

  // Resolve EVERY file's subject + topic before inserting anything. Resolving inside the import
  // loop would surface a bad topic_code in file 2 only after file 1's rows were committed —
  // the same half-import the content validation above exists to prevent. Both lookups throw.
  //
  // These are SELECTs against the global easa_* tables and take no orgId/adminId, so they sit
  // ahead of EVERY write in this function: resolveOrgId upserts `organizations` in local mode,
  // resolveAdminId creates two auth users and upserts two `users` rows, and ensureBank may
  // create a `question_banks` row. Ordering them after this loop is what makes "an import that
  // is going to abort writes nothing at all" true — the earlier form of this comment claimed
  // that while sitting below the two resolvers, so five rows were already written on an abort.
  const resolved: { rel: string; file: ContentFile; subjectId: string; topicId: string }[] = []
  for (const { rel, file } of parsed) {
    const subjectId = await lookupSubjectByCode(file.subject_code)
    resolved.push({
      rel,
      file,
      subjectId,
      topicId: await lookupTopicByCode(subjectId, file.topic_code),
    })
  }

  const orgId = await resolveOrgId()
  const adminId = await resolveAdminId(orgId)
  const bank = await ensureBank(orgId, adminId)

  const base = {
    organization_id: orgId,
    bank_id: bank.id,
    explanation_text: 'See standard ICAO/EASA VFR radiotelephony phraseology.',
    difficulty: 'medium' as const,
    status: 'active' as const,
    created_by: adminId,
  }

  if (REPLACE) {
    for (const { rel, file, topicId } of resolved) {
      await softDeleteForReplace(
        {
          rel,
          bankId: bank.id,
          topicId,
          questionType: file.question_type,
          nums: file.questions.map((q) => q.num),
        },
        adminId,
      )
    }
  }

  let totalInserted = 0
  let totalSkipped = 0

  for (const { rel, file, subjectId, topicId } of resolved) {
    let inserted = 0
    for (const q of file.questions) {
      const added = await insertIfMissing(
        bank.id,
        buildRow(file, q, { ...base, subject_id: subjectId }, topicId),
      )
      if (added) inserted++
      else totalSkipped++
    }
    totalInserted += inserted
    console.log(
      `  ${rel}: ${inserted} inserted / ${file.questions.length - inserted} skipped (${file.title}, ${file.question_type})`,
    )
  }

  console.log('\nVFR RT content import complete.')
  console.log(
    `  Target:   ${SUPABASE_URL}${FORCE_REMOTE ? '  [REMOTE]' : '  [local]'}${REPLACE ? '  [--replace]' : ''}`,
  )
  console.log(`  Org:      ${ORG_NAME} (${orgId})`)
  console.log(`  Bank:     ${bank.name} (${bank.id})`)
  console.log(`  Inserted: ${totalInserted}   Skipped (already present): ${totalSkipped}`)
  if (!FORCE_REMOTE) {
    console.log(
      `  Login:    ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}  →  http://localhost:3000/app/vfr-rt`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
