/**
 * Seed script for CI / E2E tests.
 * Creates the Egmont Aviation org, admin user, question bank,
 * reference data, and a handful of questions — enough for E2E flows.
 *
 * Env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SEED_QUESTIONS = [
  {
    question_number: 'CI-001',
    question_text: 'The atmosphere of Earth is composed of:',
    options: [
      { id: 'a', text: 'Helium (78%), oxygen (21%)', correct: false },
      { id: 'b', text: 'Oxygen (78%), nitrogen (21%)', correct: false },
      { id: 'c', text: 'Hydrogen (78%), oxygen (21%)', correct: false },
      { id: 'd', text: 'Nitrogen (78%), oxygen (21%)', correct: true },
    ],
    explanation_text: 'Nitrogen makes up 78% of the atmosphere.',
  },
  {
    question_number: 'CI-002',
    question_text: 'The lowest layer of the atmosphere is the:',
    options: [
      { id: 'a', text: 'Stratosphere', correct: false },
      { id: 'b', text: 'Troposphere', correct: true },
      { id: 'c', text: 'Mesosphere', correct: false },
      { id: 'd', text: 'Thermosphere', correct: false },
    ],
    explanation_text: 'The troposphere extends from the surface to about 11 km.',
  },
  {
    question_number: 'CI-003',
    question_text: 'The tropopause is located at approximately:',
    options: [
      { id: 'a', text: '5 km', correct: false },
      { id: 'b', text: '11 km', correct: true },
      { id: 'c', text: '50 km', correct: false },
      { id: 'd', text: '85 km', correct: false },
    ],
    explanation_text: 'The tropopause is at approximately 11 km in mid-latitudes.',
  },
  {
    question_number: 'CI-004',
    question_text: 'Temperature in the troposphere generally:',
    options: [
      { id: 'a', text: 'Increases with altitude', correct: false },
      { id: 'b', text: 'Remains constant', correct: false },
      { id: 'c', text: 'Decreases with altitude', correct: true },
      { id: 'd', text: 'Oscillates', correct: false },
    ],
    explanation_text: 'The lapse rate is approximately 2 degrees C per 1000 ft.',
  },
  {
    question_number: 'CI-005',
    question_text: 'The ISA sea-level temperature is:',
    options: [
      { id: 'a', text: '10 degrees C', correct: false },
      { id: 'b', text: '15 degrees C', correct: true },
      { id: 'c', text: '20 degrees C', correct: false },
      { id: 'd', text: '25 degrees C', correct: false },
    ],
    explanation_text: 'ISA standard temperature at sea level is 15 degrees C.',
  },
]

async function seed() {
  console.log('Seeding E2E test data...\n')

  // 1. Organization
  const { data: org, error: orgErr } = await db
    .from('organizations')
    .upsert({ name: 'Egmont Aviation', slug: 'egmont-aviation' }, { onConflict: 'slug' })
    .select('id')
    .single()
  if (orgErr) throw new Error(`Org: ${orgErr.message}`)
  console.log(`  Org: ${org.id}`)

  // 2. Admin auth user
  const adminEmail = 'ci-admin@lmsplus.local'
  const { data: authData, error: authErr } = await db.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
  })
  if (authErr && !authErr.message.includes('already been registered')) {
    throw new Error(`Auth user: ${authErr.message}`)
  }

  let userId: string
  if (authData?.user) {
    userId = authData.user.id
  } else {
    const { data: users } = await db.auth.admin.listUsers()
    const existing = users?.users.find((u) => u.email === adminEmail)
    if (!existing) throw new Error('Cannot find admin user')
    userId = existing.id
  }

  // 3. Public users row
  const { error: userErr } = await db.from('users').upsert(
    {
      id: userId,
      organization_id: org.id,
      email: adminEmail,
      full_name: 'CI Admin',
      role: 'admin',
    },
    { onConflict: 'id' },
  )
  if (userErr) throw new Error(`User: ${userErr.message}`)
  console.log(`  User: ${userId}`)

  // 4. Question bank
  const { data: bank } = await db
    .from('question_banks')
    .select('id')
    .eq('organization_id', org.id)
    .eq('name', 'EASA PPL(A) QDB')
    .is('deleted_at', null)
    .single()

  let bankId: string
  if (bank) {
    bankId = bank.id
  } else {
    const { data: newBank, error: newBankErr } = await db
      .from('question_banks')
      .insert({ organization_id: org.id, name: 'EASA PPL(A) QDB', created_by: userId })
      .select('id')
      .single()
    if (newBankErr) throw new Error(`Bank: ${newBankErr.message}`)
    bankId = newBank.id
  }
  console.log(`  Bank: ${bankId}`)

  // 5. Reference data — subject, topic, subtopic
  const { data: subject, error: subErr } = await db
    .from('easa_subjects')
    .upsert(
      { code: '050', name: 'Meteorology', short: 'MET', sort_order: 50 },
      { onConflict: 'code' },
    )
    .select('id')
    .single()
  if (subErr) throw new Error(`Subject: ${subErr.message}`)

  const { data: topicRow } = await db
    .from('easa_topics')
    .select('id')
    .eq('subject_id', subject.id)
    .eq('code', '050-01')
    .single()

  let topicId: string
  if (topicRow) {
    topicId = topicRow.id
  } else {
    const { data: newTopic, error: topicErr } = await db
      .from('easa_topics')
      .insert({ subject_id: subject.id, code: '050-01', name: 'The atmosphere', sort_order: 1 })
      .select('id')
      .single()
    if (topicErr) throw new Error(`Topic: ${topicErr.message}`)
    topicId = newTopic.id
  }

  const { data: subtopicRow } = await db
    .from('easa_subtopics')
    .select('id')
    .eq('topic_id', topicId)
    .eq('code', '050-01-01')
    .single()

  let subtopicId: string
  if (subtopicRow) {
    subtopicId = subtopicRow.id
  } else {
    const { data: newSub, error: subTopErr } = await db
      .from('easa_subtopics')
      .insert({
        topic_id: topicId,
        code: '050-01-01',
        name: 'Composition, extent and vertical division',
        sort_order: 1,
      })
      .select('id')
      .single()
    if (subTopErr) throw new Error(`Subtopic: ${subTopErr.message}`)
    subtopicId = newSub.id
  }
  console.log(`  Subject: ${subject.id}, Topic: ${topicId}, Subtopic: ${subtopicId}`)

  // 6. Questions
  let inserted = 0
  for (const q of SEED_QUESTIONS) {
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
      subject_id: subject.id,
      topic_id: topicId,
      subtopic_id: subtopicId,
      question_text: q.question_text,
      options: q.options,
      explanation_text: q.explanation_text,
      difficulty: 'medium',
      status: 'active',
      created_by: userId,
    })
    if (qErr) throw new Error(`Question ${q.question_number}: ${qErr.message}`)
    inserted++
  }
  console.log(`  Questions: ${inserted} inserted, ${SEED_QUESTIONS.length - inserted} skipped`)

  console.log('\nE2E seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
