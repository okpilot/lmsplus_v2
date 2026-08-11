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

async function lookupByCode(table: string, code: string): Promise<string> {
  const { data, error } = await db.from(table).select('id').eq('code', code).single()
  if (error || !data) throw new Error(`${table} code='${code}': ${error?.message ?? 'not found'}`)
  return data.id
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

  let totalInserted = 0
  let totalSkipped = 0

  for (const rel of targets) {
    const path = resolve(process.cwd(), rel)
    const file = JSON.parse(readFileSync(path, 'utf8')) as ContentFile
    const subjectId = await lookupByCode('easa_subjects', file.subject_code)
    const topicId = await lookupByCode('easa_topics', file.topic_code)

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
