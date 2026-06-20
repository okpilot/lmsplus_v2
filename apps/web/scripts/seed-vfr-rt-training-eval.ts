/**
 * Seed script for VFR RT Training (Practice Drills) — Phase 1 manual evaluation.
 *
 * Creates:
 * - Egmont Aviation org
 * - Admin user   (admin@lmsplus.local / admin123!)
 * - Student user (student@lmsplus.local / student123!)
 * - A question bank for the VFR RT pool
 * - A pool of 10 ACTIVE multiple_choice questions under topic P3_MC
 *
 * NO exam_config row — Phase 1 is training-only (quick_quiz study mode).
 * Non-MC question types (short_answer / dialog_fill) are added in Phase 3.
 *
 * The RT subject (code 'RT') and its three topics (P1_ACRONYMS / P2_DIALOG / P3_MC)
 * are seeded by migrations 097/098, so this script only looks them up.
 *
 * Run AFTER `npx supabase db reset` (+ the local grant fix). Idempotent (safe to re-run).
 * Usage: cd apps/web && npx tsx scripts/seed-vfr-rt-training-eval.ts
 */

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

const isLocal =
  SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
if (!isLocal && !process.argv.includes('--force-remote')) {
  console.error(
    `Refusing to seed against non-local Supabase URL: ${SUPABASE_URL}\nPass --force-remote to override.`,
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ADMIN_EMAIL = 'admin@lmsplus.local'
const ADMIN_PASSWORD = 'admin123!'
const STUDENT_EMAIL = 'student@lmsplus.local'
const STUDENT_PASSWORD = 'student123!'

// ---- question content --------------------------------------------------------

type MultipleChoice = {
  num: string
  text: string
  options: { id: string; text: string }[]
  correct: 'a' | 'b' | 'c' | 'd'
}

// Part 3 — multiple choice. 10 questions for Phase 1 MC eval.
const MULTIPLE_CHOICE: MultipleChoice[] = [
  {
    num: 'VRT-P3-001',
    text: 'What is the correct readback of an altimeter setting of 1009 hPa?',
    options: [
      { id: 'a', text: 'QNH ten oh nine' },
      { id: 'b', text: 'QNH one zero zero nine' },
      { id: 'c', text: 'QNH one thousand nine' },
      { id: 'd', text: 'QNH ten zero nine' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-002',
    text: 'Which transmission word signals a distress condition?',
    options: [
      { id: 'a', text: 'PAN PAN' },
      { id: 'b', text: 'SECURITE' },
      { id: 'c', text: 'MAYDAY' },
      { id: 'd', text: 'STANDBY' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-003',
    text: 'How is the flight level 080 transmitted?',
    options: [
      { id: 'a', text: 'Flight level eighty' },
      { id: 'b', text: 'Flight level eight hundred' },
      { id: 'c', text: 'Flight level zero eight zero' },
      { id: 'd', text: 'Flight level eight zero' },
    ],
    correct: 'd',
  },
  {
    num: 'VRT-P3-004',
    text: 'Which word indicates an urgency (not distress) condition?',
    options: [
      { id: 'a', text: 'MAYDAY' },
      { id: 'b', text: 'PAN PAN' },
      { id: 'c', text: 'WILCO' },
      { id: 'd', text: 'ROGER' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-005',
    text: 'How should the number 100 be transmitted (as an altitude in feet)?',
    options: [
      { id: 'a', text: 'One hundred' },
      { id: 'b', text: 'One zero zero' },
      { id: 'c', text: 'Hundred' },
      { id: 'd', text: 'One oh oh' },
    ],
    correct: 'a',
  },
  {
    num: 'VRT-P3-006',
    text: "What is the phonetic alphabet word for the letter 'R'?",
    options: [
      { id: 'a', text: 'Roger' },
      { id: 'b', text: 'Romeo' },
      { id: 'c', text: 'Robert' },
      { id: 'd', text: 'Rescue' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-007',
    text: 'When should a full call sign be used again after abbreviation?',
    options: [
      { id: 'a', text: 'Never once abbreviated' },
      { id: 'b', text: 'Only on first contact' },
      { id: 'c', text: 'When initiated by the ground station' },
      { id: 'd', text: 'Every transmission' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-008',
    text: 'Which phrase confirms an instruction will be complied with?',
    options: [
      { id: 'a', text: 'ROGER' },
      { id: 'b', text: 'WILCO' },
      { id: 'c', text: 'AFFIRM' },
      { id: 'd', text: 'COPY' },
    ],
    correct: 'b',
  },
  {
    num: 'VRT-P3-009',
    text: 'How is the time 0935 transmitted when the hour is clear?',
    options: [
      { id: 'a', text: 'Thirty-five' },
      { id: 'b', text: 'Nine thirty-five' },
      { id: 'c', text: 'Three five' },
      { id: 'd', text: 'Zero nine three five' },
    ],
    correct: 'c',
  },
  {
    num: 'VRT-P3-010',
    text: "What is the correct response to 'How do you read?'",
    options: [
      { id: 'a', text: 'Reading you five' },
      { id: 'b', text: 'Loud and clear' },
      { id: 'c', text: 'Read you well' },
      { id: 'd', text: 'Five by five' },
    ],
    correct: 'a',
  },
]

// ---- helpers ------------------------------------------------------------------

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error && !error.message.includes('already been registered')) {
    throw new Error(`Auth user ${email}: ${error.message}`)
  }
  if (data?.user) return data.user.id

  const { data: users } = await db.auth.admin.listUsers()
  const existing = users?.users.find((u) => u.email === email)
  if (!existing) throw new Error(`Cannot find user ${email}`)
  return existing.id
}

async function ensureUser(
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

async function lookupId(table: string, column: string, value: string): Promise<string> {
  const { data, error } = await db.from(table).select('id').eq(column, value).single()
  if (error || !data)
    throw new Error(`Lookup ${table}.${column}='${value}': ${error?.message ?? 'not found'}`)
  return data.id
}

async function ensureBank(orgId: string, adminId: string): Promise<string> {
  const NAME = 'VFR RT QDB'
  const { data: existing } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', NAME)
    .is('deleted_at', null)
    .maybeSingle()
  if (existing) return existing.id

  const { data, error } = await db
    .from('question_banks')
    .insert({ organization_id: orgId, name: NAME, created_by: adminId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Bank: ${error?.message}`)
  return data.id
}

type QuestionRow = Record<string, unknown> & { question_number: string }

async function insertQuestionIfMissing(bankId: string, row: QuestionRow): Promise<boolean> {
  const { data: existing } = await db
    .from('questions')
    .select('id')
    .eq('bank_id', bankId)
    .eq('question_number', row.question_number)
    .is('deleted_at', null)
    .limit(1)
  if (existing && existing.length > 0) return false

  const { error } = await db.from('questions').insert(row)
  if (error) throw new Error(`Question ${row.question_number}: ${error.message}`)
  return true
}

// ---- main ---------------------------------------------------------------------

async function seed(): Promise<void> {
  // Org (shared slug with other eval seeds so the same login works everywhere)
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`Org: ${orgErr?.message}`)

  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUser(adminId, org.id, ADMIN_EMAIL, 'admin')
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUser(studentId, org.id, STUDENT_EMAIL, 'student')

  // RT subject + topics are migration-seeded; look them up.
  const rtSubjectId = await lookupId('easa_subjects', 'code', 'RT')
  const p3TopicId = await lookupId('easa_topics', 'code', 'P3_MC')

  const bankId = await ensureBank(org.id, adminId)

  const base = {
    organization_id: org.id,
    bank_id: bankId,
    subject_id: rtSubjectId,
    explanation_text: 'See standard ICAO/EASA VFR radiotelephony phraseology.',
    difficulty: 'medium' as const,
    status: 'active' as const,
    created_by: adminId,
  }

  let inserted = 0

  // Part 3 — multiple_choice (answer key in correct_option_id; trigger strips it from options)
  for (const q of MULTIPLE_CHOICE) {
    const added = await insertQuestionIfMissing(bankId, {
      ...base,
      question_number: q.num,
      topic_id: p3TopicId,
      question_type: 'multiple_choice',
      question_text: q.text,
      options: q.options,
      canonical_answer: null,
      accepted_synonyms: [],
      dialog_template: null,
      blanks_config: [],
      correct_option_id: q.correct,
    })
    if (added) inserted++
  }

  console.log('VFR RT Training eval seed complete (Phase 1 — MC only).')
  console.log(`  Org:              Egmont Aviation (${org.id})`)
  console.log(`  Admin:            ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`  Student:          ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log(`  RT subject:       ${rtSubjectId}`)
  console.log(`  P3_MC topic:      ${p3TopicId}`)
  console.log(`  Questions added:  ${inserted} of ${MULTIPLE_CHOICE.length} MC questions`)
  console.log('  No exam_config — training uses /app/vfr-rt (quick_quiz study mode)')
  console.log('  Start at:         http://localhost:3000/app/vfr-rt')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
