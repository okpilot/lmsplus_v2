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
 * Usage:
 *   cd apps/web
 *   npx tsx scripts/import-vfr-rt-content.ts                       # imports Part 1 locally
 *   npx tsx scripts/import-vfr-rt-content.ts content/foo.json bar.json
 *   npx tsx scripts/import-vfr-rt-content.ts --force-remote        # prod (needs existing org+admin)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

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
  question_type: 'short_answer' | 'multiple_choice'
  questions: (ShortAnswerItem | McItem)[]
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

// The types buildRow has a branch for. Widen both together when adding dialog_fill / ordering /
// diagram_label — the DB accepts all five (questions_question_type_check).
const SUPPORTED_TYPES = ['short_answer', 'multiple_choice']

/** Assert a content field is a present, non-blank string. `label` names the field for the error. */
function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string (got ${JSON.stringify(value)})`)
  }
}

/**
 * Assert a parsed-JSON node is a plain object before any field is read off it. Without this,
 * `questions: [null]` (or a non-object root) crashes with a bare TypeError from the first
 * property access, instead of naming the file and index like every other content error here.
 */
function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object (got ${JSON.stringify(value)})`)
  }
}

// ---- row building ------------------------------------------------------------

type QuestionRow = Record<string, unknown> & { question_number: string }

function buildRow(
  file: ContentFile,
  q: ShortAnswerItem | McItem,
  base: Record<string, unknown>,
  topicId: string,
): QuestionRow {
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
  throw new Error(`Unsupported question_type '${file.question_type}' (add a branch in buildRow)`)
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
  // that half-import into a clean abort. Keep this in step with buildRow — a field buildRow
  // writes but this loop does not check is a field that fails mid-run.
  //
  // `num` gets the strictest treatment because it is the idempotency key: non-empty string and
  // unique across ALL loaded files (they share one bank). A missing/non-string `num` would
  // otherwise reach the INSERT as question_number NULL, which idx_questions_bank_number
  // (UNIQUE (bank_id, question_number) WHERE deleted_at IS NULL AND question_number IS NOT NULL)
  // exempts — so the row would silently re-insert a duplicate on every re-run.
  const parsed = targets.map((rel) => {
    const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8'))
    requireRecord(raw, `${rel}: root`)
    const file = raw as unknown as ContentFile
    requireText(file.subject_code, `${rel}: 'subject_code'`)
    requireText(file.topic_code, `${rel}: 'topic_code'`)
    // buildRow throws on an unsupported type, but only once it reaches that item mid-loop.
    if (!SUPPORTED_TYPES.includes(file.question_type)) {
      throw new Error(
        `${rel}: unsupported question_type ${JSON.stringify(file.question_type)} — this importer handles ${SUPPORTED_TYPES.join('/')}; add a buildRow branch first`,
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
      if (file.question_type === 'short_answer') {
        const sa = q as ShortAnswerItem
        requireText(sa.canonical, `${at} (${q.num}): 'canonical'`)
        if (sa.synonyms !== undefined && !Array.isArray(sa.synonyms)) {
          throw new Error(`${at} (${q.num}): 'synonyms' must be an array when present`)
        }
        // accepted_synonyms is TEXT[], which happily stores a NULL or blank element — it would
        // just never match anything the grader normalizes, so it fails silently at answer time.
        for (const [j, synonym] of (sa.synonyms ?? []).entries()) {
          requireText(synonym, `${at} (${q.num}): synonyms[${j}]`)
        }
      } else {
        const mc = q as McItem
        if (!Array.isArray(mc.options) || mc.options.length === 0) {
          throw new Error(`${at} (${q.num}): 'options' must be a non-empty array`)
        }
        // The DB CHECK only constrains correct_option_id to 'a'..'d'; nothing enforces that it
        // names an option that actually exists, and trg_sanitize_question_options rewrites each
        // element to {id,text}, silently emitting nulls for a malformed one. Both would import
        // clean and render un-answerable, so check the mapping here.
        if (!MC_OPTION_IDS.includes(mc.correct)) {
          throw new Error(
            `${at} (${q.num}): 'correct' must be one of ${MC_OPTION_IDS.join('/')} (got ${JSON.stringify(mc.correct)})`,
          )
        }
        const optionIds = new Set<string>()
        for (const [j, opt] of mc.options.entries()) {
          requireText(opt?.id, `${at} (${q.num}): options[${j}].id`)
          requireText(opt?.text, `${at} (${q.num}): options[${j}].text`)
          // A duplicate id makes `correct` ambiguous and the runner's option lookup arbitrary.
          if (optionIds.has(opt.id)) {
            throw new Error(`${at} (${q.num}): duplicate option id '${opt.id}'`)
          }
          optionIds.add(opt.id)
        }
        if (!mc.options.some((o) => o.id === mc.correct)) {
          throw new Error(
            `${at} (${q.num}): 'correct' is '${mc.correct}' but no option carries that id`,
          )
        }
      }
    }
  }

  const orgId = await resolveOrgId()
  const adminId = await resolveAdminId(orgId)

  // Resolve EVERY file's subject + topic before inserting anything. Resolving inside the import
  // loop would surface a bad topic_code in file 2 only after file 1's rows were committed —
  // the same half-import the content validation above exists to prevent. Both lookups throw.
  // These are SELECTs, so they stay ahead of ensureBank below, which in local mode may restore
  // or create a question_banks row: an import that is going to abort should write nothing at all.
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

  const bank = await ensureBank(orgId, adminId)

  const base = {
    organization_id: orgId,
    bank_id: bank.id,
    explanation_text: 'See standard ICAO/EASA VFR radiotelephony phraseology.',
    difficulty: 'medium' as const,
    status: 'active' as const,
    created_by: adminId,
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
  console.log(`  Target:   ${SUPABASE_URL}${FORCE_REMOTE ? '  [REMOTE]' : '  [local]'}`)
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
