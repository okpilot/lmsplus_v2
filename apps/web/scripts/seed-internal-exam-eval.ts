/**
 * Seed script for Internal Exam manual evaluation (PR #718 — #592 recovery label).
 *
 * Creates:
 * - Egmont Aviation org
 * - Admin user   (admin@lmsplus.local / admin123!)
 * - Student user (student@lmsplus.local / student123!)
 * - MET subject + topic + subtopic, 12 ACTIVE questions
 * - An ENABLED exam_config (10 questions, 30-min timer, 70% pass) + one distribution
 * - A pre-issued, unconsumed internal-exam code EXAMTEST for the student
 *
 * So the student can log in, start the internal exam with code EXAMTEST, answer a
 * question, reload mid-exam, and verify the resume prompt reads "Internal Exam".
 *
 * Run AFTER `npx supabase db reset`. Idempotent (safe to re-run).
 * Usage: cd apps/web && npx tsx scripts/seed-internal-exam-eval.ts
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

const EXAM_CODE = 'EXAMTEST' // 8 chars, Crockford alphabet (no I/O/0/1)
const TOTAL_QUESTIONS = 10
const QUESTION_POOL = 12 // > TOTAL_QUESTIONS so sampling always succeeds

async function createAuthUser(email: string, password: string) {
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

async function ensureUser(id: string, orgId: string, email: string, role: 'admin' | 'student') {
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

async function seed() {
  console.log('Seeding Internal Exam eval data...\n')

  // 1. Org
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr) throw new Error(`Org: ${orgErr.message}`)
  console.log(`  Org: ${org.id}`)

  // 2. Admin + student
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  await ensureUser(adminId, org.id, ADMIN_EMAIL, 'admin')
  console.log(`  Admin:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)

  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  await ensureUser(studentId, org.id, STUDENT_EMAIL, 'student')
  console.log(`  Student: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)

  // 3. Bank
  const { data: existingBank } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .eq('name', 'EASA PPL(A) QDB')
    .is('deleted_at', null)
    .maybeSingle()
  let bankId: string
  if (existingBank) {
    bankId = existingBank.id
  } else {
    const { data: newBank, error: bankErr } = await db
      .from('question_banks')
      .insert({ organization_id: org.id, name: 'EASA PPL(A) QDB', created_by: adminId })
      .select('id')
      .single()
    if (bankErr) throw new Error(`Bank: ${bankErr.message}`)
    bankId = newBank.id
  }

  // 4. Subject / topic / subtopic
  const { data: met, error: metErr } = await db
    .from('easa_subjects')
    .upsert(
      { code: '050', name: 'Meteorology', short: 'MET', sort_order: 5 },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (metErr) throw new Error(`Subject: ${metErr.message}`)

  const { data: topic } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', met.id)
    .eq('code', '050-01')
    .maybeSingle()
  let topicId: string
  if (topic) {
    topicId = topic.id
  } else {
    const { data: newTopic, error: topicErr } = await db
      .from('easa_topics')
      .insert({ subject_id: met.id, code: '050-01', name: 'The atmosphere', sort_order: 1 })
      .select('id')
      .single()
    if (topicErr) throw new Error(`Topic: ${topicErr.message}`)
    topicId = newTopic.id
  }

  const { data: subtopic } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', topicId)
    .eq('code', '050-01-01')
    .maybeSingle()
  let subtopicId: string
  if (subtopic) {
    subtopicId = subtopic.id
  } else {
    const { data: newSub, error: subErr } = await db
      .from('easa_subtopics')
      .insert({
        topic_id: topicId,
        code: '050-01-01',
        name: 'Composition and extent',
        sort_order: 1,
      })
      .select('id')
      .single()
    if (subErr) throw new Error(`Subtopic: ${subErr.message}`)
    subtopicId = newSub.id
  }
  console.log(`  MET: subject ${met.id} / topic ${topicId} / subtopic ${subtopicId}`)

  // 5. Active questions (>= TOTAL_QUESTIONS so the exam can sample a full set)
  let qInserted = 0
  for (let i = 1; i <= QUESTION_POOL; i++) {
    const num = `IE-${String(i).padStart(3, '0')}`
    const { data: existing } = await db
      .from('questions')
      .select('id')
      .eq('bank_id', bankId)
      .eq('question_number', num)
      .is('deleted_at', null)
      .limit(1)
    if (existing && existing.length > 0) continue

    const { error: qErr } = await db.from('questions').insert({
      organization_id: org.id,
      bank_id: bankId,
      question_number: num,
      subject_id: met.id,
      topic_id: topicId,
      subtopic_id: subtopicId,
      question_text: `Internal-exam eval question ${i}: which option is correct?`,
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B (correct)' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' },
      ],
      // MC answer key now lives in its own REVOKE-gated column (#823, mig 109).
      correct_option_id: 'b',
      explanation_text: 'Option B is correct for this eval question.',
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    if (qErr) throw new Error(`Question ${num}: ${qErr.message}`)
    qInserted++
  }
  console.log(`  Questions: ${qInserted} inserted (pool of ${QUESTION_POOL} active)`)

  // 6. Exam config (enabled) + distribution. 30-min timer so it won't auto-submit mid-test.
  // The (organization_id, subject_id) uniqueness is a partial index (WHERE deleted_at
  // IS NULL), which ON CONFLICT can't target — so check-then-insert/update instead.
  const { data: existingCfg } = await db
    .from('exam_configs')
    .select('id')
    .eq('organization_id', org.id)
    .eq('subject_id', met.id)
    .is('deleted_at', null)
    .maybeSingle()

  let cfg: { id: string }
  if (existingCfg) {
    const { error: cfgUpdErr } = await db
      .from('exam_configs')
      .update({
        enabled: true,
        total_questions: TOTAL_QUESTIONS,
        time_limit_seconds: 1800,
        pass_mark: 70,
      })
      .eq('id', existingCfg.id)
    if (cfgUpdErr) throw new Error(`Exam config update: ${cfgUpdErr.message}`)
    cfg = existingCfg
  } else {
    const { data: newCfg, error: cfgErr } = await db
      .from('exam_configs')
      .insert({
        organization_id: org.id,
        subject_id: met.id,
        enabled: true,
        total_questions: TOTAL_QUESTIONS,
        time_limit_seconds: 1800,
        pass_mark: 70,
      })
      .select('id')
      .single()
    if (cfgErr) throw new Error(`Exam config: ${cfgErr.message}`)
    cfg = newCfg
  }

  const { data: existingDist } = await db
    .from('exam_config_distributions')
    .select('id')
    .eq('exam_config_id', cfg.id)
    .eq('topic_id', topicId)
    .maybeSingle()
  if (!existingDist) {
    const { error: distErr } = await db.from('exam_config_distributions').insert({
      exam_config_id: cfg.id,
      topic_id: topicId,
      subtopic_id: null,
      question_count: TOTAL_QUESTIONS,
    })
    if (distErr) throw new Error(`Distribution: ${distErr.message}`)
  }
  console.log(`  Exam config: ${cfg.id} (enabled, ${TOTAL_QUESTIONS}Q / 30min / 70%)`)

  // 7. Pre-issue an internal-exam code for the student (fresh, unconsumed, +7d).
  // Service-role insert bypasses the RLS no-INSERT policy; reset consumed/voided
  // state on re-run so the code is always startable.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: codeErr } = await db.from('internal_exam_codes').upsert(
    {
      code: EXAM_CODE,
      subject_id: met.id,
      student_id: studentId,
      issued_by: adminId,
      organization_id: org.id,
      expires_at: expiresAt,
      consumed_at: null,
      consumed_session_id: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      deleted_at: null,
    },
    { onConflict: 'code' },
  )
  if (codeErr) throw new Error(`Internal exam code: ${codeErr.message}`)

  console.log('\n--- INTERNAL EXAM EVAL READY ---')
  console.log(`\nStudent login: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log(`Admin login:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`\nInternal exam code (for the student): ${EXAM_CODE}`)
  console.log('\nDev server:  http://localhost:3000')
  console.log('Student entry: http://localhost:3000/app/internal-exam')
  console.log('\nFlow to test the resume label (#592):')
  console.log('  1. Log in as the student.')
  console.log('  2. Go to /app/internal-exam, start the exam with code EXAMTEST.')
  console.log('  3. Answer a question, then RELOAD the page mid-exam.')
  console.log('  4. The resume prompt should read "Internal Exam" (not "Practice Exam").\n')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
