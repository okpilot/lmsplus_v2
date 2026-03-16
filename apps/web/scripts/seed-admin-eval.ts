/**
 * Seed script for Admin Syllabus Manager manual evaluation.
 * Creates: admin user, student user, 3 subjects with topics/subtopics,
 * and a few questions referencing one subtopic (to test delete protection).
 *
 * Run AFTER `npx supabase db reset` (which applies all migrations).
 * Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage: cd apps/web && npx tsx scripts/seed-admin-eval.ts
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

// Local-only script — refuse to run against non-local URLs
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

async function seed() {
  console.log('Seeding Admin Syllabus Manager eval data...\n')

  // 1. Organization
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr) throw new Error(`Org: ${orgErr.message}`)
  console.log(`  Org: ${org.id}`)

  // 2. Admin user (with password for easy local login)
  const adminId = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD)
  const { error: adminErr } = await db.from('users').upsert(
    {
      id: adminId,
      organization_id: org.id,
      email: ADMIN_EMAIL,
      full_name: 'Admin User',
      role: 'admin',
    },
    { onConflict: 'id' },
  )
  if (adminErr) throw new Error(`Admin user row: ${adminErr.message}`)
  console.log(`  Admin: ${adminId} (${ADMIN_EMAIL} / ${ADMIN_PASSWORD})`)

  // 3. Student user (for 403 test)
  const studentId = await createAuthUser(STUDENT_EMAIL, STUDENT_PASSWORD)
  const { error: studentErr } = await db.from('users').upsert(
    {
      id: studentId,
      organization_id: org.id,
      email: STUDENT_EMAIL,
      full_name: 'Student User',
      role: 'student',
    },
    { onConflict: 'id' },
  )
  if (studentErr) throw new Error(`Student user row: ${studentErr.message}`)
  console.log(`  Student: ${studentId} (${STUDENT_EMAIL} / ${STUDENT_PASSWORD})`)

  // 4. Question bank (select existing or insert)
  const { data: existingBank } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .eq('name', 'EASA PPL(A) QDB')
    .is('deleted_at', null)
    .single()

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
  console.log(`  Bank: ${bankId}`)

  // 5. Seed one subject with topic + subtopic + questions (to test delete protection)
  const { data: met, error: metErr } = await db
    .from('easa_subjects')
    .upsert(
      { code: '050', name: 'Meteorology', short: 'MET', sort_order: 5 },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (metErr) throw new Error(`Subject MET: ${metErr.message}`)

  const { data: topic, error: topicLookupErr } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', met.id)
    .eq('code', '050-01')
    .maybeSingle()
  if (topicLookupErr) throw new Error(`Topic lookup: ${topicLookupErr.message}`)

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

  const { data: subtopic, error: subtopicLookupErr } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', topicId)
    .eq('code', '050-01-01')
    .maybeSingle()
  if (subtopicLookupErr) throw new Error(`Subtopic lookup: ${subtopicLookupErr.message}`)

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

  console.log(`  MET subject: ${met.id}, topic: ${topicId}, subtopic: ${subtopicId}`)

  // 6. Insert 3 questions referencing MET (to test delete protection)
  const questions = [
    {
      question_number: 'EVAL-001',
      question_text: 'The troposphere extends to approximately:',
      correct: 'b',
    },
    { question_number: 'EVAL-002', question_text: 'ISA sea-level temperature is:', correct: 'b' },
    { question_number: 'EVAL-003', question_text: 'Cumulonimbus clouds produce:', correct: 'b' },
  ]

  let qInserted = 0
  for (const q of questions) {
    const { data: existing } = await db
      .from('questions')
      .select('id')
      .eq('bank_id', bankId)
      .eq('question_number', q.question_number)
      .is('deleted_at', null)
      .limit(1)
    if (existing && existing.length > 0) continue

    const { error: qErr } = await db.from('questions').insert({
      organization_id: org.id,
      bank_id: bankId,
      question_number: q.question_number,
      subject_id: met.id,
      topic_id: topicId,
      subtopic_id: subtopicId,
      question_text: q.question_text,
      options: [
        { id: 'a', text: 'Option A', correct: false },
        { id: 'b', text: 'Option B', correct: true },
        { id: 'c', text: 'Option C', correct: false },
        { id: 'd', text: 'Option D', correct: false },
      ],
      explanation_text: 'Test explanation.',
      difficulty: 'medium',
      status: 'active',
      created_by: adminId,
    })
    if (qErr) throw new Error(`Failed to insert ${q.question_number}: ${qErr.message}`)
    qInserted++
  }
  console.log(`  Questions: ${qInserted} inserted`)

  console.log('\n--- EVAL READY ---')
  console.log(`\nAdmin login:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`Student login: ${STUDENT_EMAIL} / ${STUDENT_PASSWORD}`)
  console.log('\nDev server:    http://localhost:3000')
  console.log('Admin page:    http://localhost:3000/app/admin/syllabus')
  console.log('\nThe MET subject has 3 questions → delete button should be disabled.')
  console.log('Empty subjects/topics/subtopics added via the UI can be deleted.\n')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
