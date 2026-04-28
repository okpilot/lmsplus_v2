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
  {
    question_number: 'CI-006',
    question_text: 'The ISA sea-level pressure is:',
    options: [
      { id: 'a', text: '1013.25 hPa', correct: true },
      { id: 'b', text: '1000 hPa', correct: false },
      { id: 'c', text: '1020 hPa', correct: false },
      { id: 'd', text: '990 hPa', correct: false },
    ],
    explanation_text: 'ISA standard pressure at sea level is 1013.25 hPa.',
  },
  {
    question_number: 'CI-007',
    question_text: 'The ISA lapse rate in the troposphere is approximately:',
    options: [
      { id: 'a', text: '1 degree C per 1000 ft', correct: false },
      { id: 'b', text: '2 degrees C per 1000 ft', correct: true },
      { id: 'c', text: '3 degrees C per 1000 ft', correct: false },
      { id: 'd', text: '4 degrees C per 1000 ft', correct: false },
    ],
    explanation_text: 'The ISA lapse rate is approximately 1.98 degrees C per 1000 ft.',
  },
  {
    question_number: 'CI-008',
    question_text: 'Cumulonimbus clouds are associated with:',
    options: [
      { id: 'a', text: 'Fair weather', correct: false },
      { id: 'b', text: 'Thunderstorms', correct: true },
      { id: 'c', text: 'Fog', correct: false },
      { id: 'd', text: 'Drizzle', correct: false },
    ],
    explanation_text: 'Cumulonimbus (Cb) clouds produce thunderstorms.',
  },
  {
    question_number: 'CI-009',
    question_text: 'Wind direction is given as the direction:',
    options: [
      { id: 'a', text: 'The wind is blowing towards', correct: false },
      { id: 'b', text: 'The wind is blowing from', correct: true },
      { id: 'c', text: 'Of the isobars', correct: false },
      { id: 'd', text: 'Of aircraft heading', correct: false },
    ],
    explanation_text: 'Wind direction is always given as the direction from which it blows.',
  },
  {
    question_number: 'CI-010',
    question_text: 'The Coriolis effect causes wind to deflect to the:',
    options: [
      { id: 'a', text: 'Left in the Northern Hemisphere', correct: false },
      { id: 'b', text: 'Right in the Northern Hemisphere', correct: true },
      { id: 'c', text: 'Left in both hemispheres', correct: false },
      { id: 'd', text: 'Right in both hemispheres', correct: false },
    ],
    explanation_text: 'Coriolis deflects wind right in the NH, left in the SH.',
  },
  {
    question_number: 'CI-011',
    question_text: 'An inversion is a layer where temperature:',
    options: [
      { id: 'a', text: 'Decreases rapidly', correct: false },
      { id: 'b', text: 'Remains constant', correct: false },
      { id: 'c', text: 'Increases with altitude', correct: true },
      { id: 'd', text: 'Oscillates', correct: false },
    ],
    explanation_text: 'An inversion is a layer where temperature increases with altitude.',
  },
  {
    question_number: 'CI-012',
    question_text: 'Relative humidity reaches 100% at the:',
    options: [
      { id: 'a', text: 'Freezing level', correct: false },
      { id: 'b', text: 'Dew point', correct: true },
      { id: 'c', text: 'Tropopause', correct: false },
      { id: 'd', text: 'Sea level', correct: false },
    ],
    explanation_text: 'When air cools to its dew point, relative humidity is 100%.',
  },
  {
    question_number: 'CI-013',
    question_text: 'A METAR is a:',
    options: [
      { id: 'a', text: 'Forecast report', correct: false },
      { id: 'b', text: 'Routine weather observation', correct: true },
      { id: 'c', text: 'Pilot report', correct: false },
      { id: 'd', text: 'Significant weather chart', correct: false },
    ],
    explanation_text: 'METAR is a routine aerodrome weather observation report.',
  },
  {
    question_number: 'CI-014',
    question_text: 'A TAF covers a period of:',
    options: [
      { id: 'a', text: '3 hours', correct: false },
      { id: 'b', text: '6 hours', correct: false },
      { id: 'c', text: '9 to 30 hours', correct: true },
      { id: 'd', text: '48 hours', correct: false },
    ],
    explanation_text: 'TAF validity ranges from 9 to 30 hours depending on type.',
  },
  {
    question_number: 'CI-015',
    question_text: 'Fog forms when the temperature-dew point spread is:',
    options: [
      { id: 'a', text: 'Greater than 10 degrees C', correct: false },
      { id: 'b', text: 'Less than 3 degrees C', correct: true },
      { id: 'c', text: 'Exactly 0 degrees C', correct: false },
      { id: 'd', text: 'Greater than 5 degrees C', correct: false },
    ],
    explanation_text: 'Fog is likely when temperature-dew point spread is less than 3 degrees C.',
  },
  {
    question_number: 'CI-016',
    question_text: 'A cold front typically brings:',
    options: [
      { id: 'a', text: 'Gradual clearing', correct: false },
      { id: 'b', text: 'Heavy rain and gusty winds', correct: true },
      { id: 'c', text: 'Extended drizzle', correct: false },
      { id: 'd', text: 'Calm conditions', correct: false },
    ],
    explanation_text: 'Cold fronts are associated with heavy rain, gusty winds, and Cb clouds.',
  },
  {
    question_number: 'CI-017',
    question_text: 'Pressure altitude is the altitude indicated when QNH is set to:',
    options: [
      { id: 'a', text: '1013.25 hPa', correct: true },
      { id: 'b', text: 'QFE', correct: false },
      { id: 'c', text: 'Local QNH', correct: false },
      { id: 'd', text: '29.92 inHg', correct: false },
    ],
    explanation_text: 'Pressure altitude is read when altimeter is set to standard (1013.25 hPa).',
  },
  {
    question_number: 'CI-018',
    question_text: 'Density altitude increases with:',
    options: [
      { id: 'a', text: 'Lower temperature', correct: false },
      { id: 'b', text: 'Higher pressure', correct: false },
      { id: 'c', text: 'Higher temperature', correct: true },
      { id: 'd', text: 'Lower humidity', correct: false },
    ],
    explanation_text: 'Higher temperature decreases air density, increasing density altitude.',
  },
  {
    question_number: 'CI-019',
    question_text: 'The jet stream is found near the:',
    options: [
      { id: 'a', text: 'Surface', correct: false },
      { id: 'b', text: 'Tropopause', correct: true },
      { id: 'c', text: 'Mesosphere', correct: false },
      { id: 'd', text: 'Stratopause', correct: false },
    ],
    explanation_text: 'Jet streams are found near the tropopause, typically between FL250-FL450.',
  },
  {
    question_number: 'CI-020',
    question_text: 'Wind shear is most dangerous during:',
    options: [
      { id: 'a', text: 'Cruise', correct: false },
      { id: 'b', text: 'Takeoff and landing', correct: true },
      { id: 'c', text: 'Taxiing', correct: false },
      { id: 'd', text: 'Parking', correct: false },
    ],
    explanation_text: 'Wind shear is most hazardous at low altitude during takeoff and landing.',
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

  // 7. Exam config for MET — required by exam-flow.spec.ts and exam-recovery.spec.ts.
  // 60s timer + 10 questions + 70% pass mark to match what the specs assert.
  const { data: existingCfg } = await db
    .from('exam_configs')
    .select('id')
    .eq('organization_id', org.id)
    .eq('subject_id', subject.id)
    .is('deleted_at', null)
    .maybeSingle()

  let examConfigId: string
  if (existingCfg) {
    examConfigId = existingCfg.id
  } else {
    const { data: newCfg, error: cfgErr } = await db
      .from('exam_configs')
      .insert({
        organization_id: org.id,
        subject_id: subject.id,
        enabled: true,
        total_questions: 10,
        time_limit_seconds: 60,
        pass_mark: 70,
      })
      .select('id')
      .single()
    if (cfgErr) throw new Error(`Exam config: ${cfgErr.message}`)
    examConfigId = newCfg.id
  }

  const { data: existingDist } = await db
    .from('exam_config_distributions')
    .select('id')
    .eq('exam_config_id', examConfigId)
    .eq('topic_id', topicId)
    .maybeSingle()

  if (!existingDist) {
    const { error: distErr } = await db.from('exam_config_distributions').insert({
      exam_config_id: examConfigId,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 10,
    })
    if (distErr) throw new Error(`Exam distribution: ${distErr.message}`)
  }
  console.log(`  Exam config: MET (10Q / 60s / 70%) → ${examConfigId}`)

  console.log('\nE2E seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
